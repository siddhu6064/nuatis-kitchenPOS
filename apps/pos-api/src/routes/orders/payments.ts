import { Router, type IRouter, type Request, type Response } from "express";
import { CreatePaymentRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { recalcOrderTotals, writeAuditLog } from "../../lib/db.js";

export const paymentsRouter: IRouter = Router({ mergeParams: true });

// Stateless — auto-confirms for cash + card_mock in same request
const AUTO_CONFIRM_METHODS = new Set(["cash", "card_mock"]);

async function confirmPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  paymentId: string,
  orderId: string,
  tenantId: string,
  tipCents: number
): Promise<void> {
  const now = new Date().toISOString();
  await db.from("payments").update({ status: "succeeded", updated_at: now }).eq("id", paymentId);
  await db.from("orders").update({ status: "paid", tip_cents: tipCents, closed_at: now, updated_at: now }).eq("id", orderId).eq("tenant_id", tenantId);
}

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/payments — create (and auto-confirm if cash/card_mock)
//
// Cash payment wiring:
//   When method='cash', a cash_event row of type='cash_sale' is inserted into
//   the open cash_drawer_session for this location. If no open session exists,
//   the request is rejected with 409 / code='no_open_cash_session'.
//
//   Future: cash refunds (Batch 13) will insert a cash_event of type='cash_refund'.
// ---------------------------------------------------------------------------
paymentsRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreatePaymentRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order — must be open or fired
  const { data: order, error: orderErr } = await db.from("orders").select("id, status, location_id, subtotal_cents").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (!["open", "fired"].includes(order.status as string)) { res.status(409).json({ error: { code: "conflict", message: `Cannot pay order with status '${order.status as string}'` } }); return; }

  // For cash payments, look up the open session BEFORE creating the payment
  let cashSessionId: string | null = null;
  if (parsed.data.method === "cash") {
    const { data: session } = await db
      .from("cash_drawer_sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("location_id", order.location_id)
      .eq("status", "open")
      .maybeSingle();

    if (!session) {
      res.status(409).json({
        error: {
          code: "no_open_cash_session",
          message: "No open cash session for this location. Please open a shift before taking cash payments.",
        },
      });
      return;
    }
    cashSessionId = session.id as string;
  }

  // Calculate totals
  const subtotal_cents = await recalcOrderTotals(client, orderId, tenantId);
  const { data: location } = await db.from("locations").select("sales_tax_bps").eq("id", order.location_id).maybeSingle();
  const salesTaxBps: number = (location?.sales_tax_bps as number) ?? 825;
  const tax_cents = Math.round((subtotal_cents * salesTaxBps) / 10000);
  const tip_cents = parsed.data.tip_cents;
  const total_cents = subtotal_cents + tax_cents + tip_cents;

  const isAutoConfirm = AUTO_CONFIRM_METHODS.has(parsed.data.method);
  const initialStatus = isAutoConfirm ? "succeeded" : "requires_payment_method";

  const { data: payment, error: paymentErr } = await db
    .from("payments")
    .insert({
      order_id: orderId,
      tenant_id: tenantId,
      amount_cents: total_cents,
      tip_cents,
      status: initialStatus,
      method: parsed.data.method,
    })
    .select()
    .single();

  if (paymentErr) { res.status(500).json({ error: { code: "internal_error", message: paymentErr.message } }); return; }

  // Auto-confirm for cash/card_mock
  if (isAutoConfirm) {
    await confirmPayment(db, payment.id, orderId, tenantId, tip_cents);
    await db.from("orders").update({ tax_cents, total_cents }).eq("id", orderId).eq("tenant_id", tenantId);
  }

  const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;

  // Record cash sale event in the open drawer session
  if (parsed.data.method === "cash" && cashSessionId) {
    await db.from("cash_events").insert({
      session_id: cashSessionId,
      type: "cash_sale",
      amount_cents: total_cents,
      reason: null,
      staff_id: staffId,
    });
  }

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "payment_created", target_type: "payment", target_id: payment.id, payload: { method: parsed.data.method, amount_cents: total_cents, auto_confirmed: isAutoConfirm, cash_session_id: cashSessionId }, ip_address: req.ip });

  // Return fresh order state alongside payment
  const { data: updatedOrder } = await db.from("orders").select("*").eq("id", orderId).single();
  res.status(201).json({ payment, order: updatedOrder });
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/payments/:pid/confirm — manual override (session only)
// ---------------------------------------------------------------------------
paymentsRouter.post(
  "/:pid/confirm",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    const pid = req.params["pid"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: payment, error: payErr } = await db.from("payments").select("*").eq("id", pid).eq("order_id", orderId).eq("tenant_id", tenantId).maybeSingle();
    if (payErr) { res.status(500).json({ error: { code: "internal_error", message: payErr.message } }); return; }
    if (!payment) { res.status(404).json({ error: { code: "not_found", message: "Payment not found" } }); return; }
    if (payment.status !== "requires_payment_method") { res.status(409).json({ error: { code: "conflict", message: `Payment status is '${payment.status as string}' — cannot confirm` } }); return; }

    await confirmPayment(db, pid, orderId, tenantId, payment.tip_cents as number);

    const sessionAuth = req.auth! as { user_id: string };
    writeAuditLog(client, { tenant_id: tenantId, staff_id: sessionAuth.user_id, action: "payment_confirmed", target_type: "payment", target_id: pid, ip_address: req.ip });

    const { data: confirmedPayment } = await db.from("payments").select("*").eq("id", pid).single();
    res.json(confirmedPayment);
  }
);
