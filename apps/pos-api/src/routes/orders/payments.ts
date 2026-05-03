import { Router, type IRouter, type Request, type Response } from "express";
import { CreatePaymentRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { recalcOrderTotals, writeAuditLog } from "../../lib/db.js";
import { getStripe, createPaymentIntent } from "../../lib/stripe.js";

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
// card_stripe wiring:
//   Creates a Stripe PaymentIntent on the tenant's connected account.
//   Returns client_secret for the Terminal Web SDK to collectPaymentMethod.
//   The order stays open — it is confirmed when payment_intent.succeeded
//   webhook fires (see routes/stripe/webhook.ts).
//
// Charge amount sourcing:
//   recalcOrderTotals() writes subtotal, discount_total, tax, and total to the
//   order row. We then re-read order.total_cents as the single source of truth
//   for the charge amount — no recomputation here. This ensures discounts are
//   always reflected in the PaymentIntent amount and cash payment row.
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
  const { data: order, error: orderErr } = await db.from("orders").select("id, status, location_id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
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

  // Recalc writes correct subtotal / discount_total / tax / total to the order row.
  // Never recompute here — read the stored total as the single source of truth.
  await recalcOrderTotals(client, orderId, tenantId);

  const { data: storedTotals, error: totalsErr } = await db
    .from("orders")
    .select("total_cents, tax_cents")
    .eq("id", orderId)
    .single();

  if (totalsErr || !storedTotals) {
    res.status(500).json({ error: { code: "internal_error", message: "Failed to read order totals" } });
    return;
  }

  const stored_total_cents: number = storedTotals.total_cents as number;
  const tax_cents: number = storedTotals.tax_cents as number;
  const tip_cents = parsed.data.tip_cents;
  // Payment amount includes tip; order.total_cents excludes tip (tip tracked separately)
  const total_cents = stored_total_cents + tip_cents;

  // ── Stripe card_stripe — create PaymentIntent ─────────────────────────────
  let stripePaymentIntentId: string | null = null;
  let clientSecret: string | null = null;

  if (parsed.data.method === "card_stripe") {
    const stripe = getStripe();

    if (stripe) {
      // Real mode — validate tenant onboarding + create PI on connected account
      const { data: tenant } = await db
        .from("tenants")
        .select("stripe_account_id, stripe_charges_enabled, application_fee_bps")
        .eq("id", tenantId)
        .single();

      const stripeAccountId = tenant?.stripe_account_id as string | null;
      const chargesEnabled = tenant?.stripe_charges_enabled as boolean ?? false;

      if (!stripeAccountId || !chargesEnabled) {
        res.status(412).json({
          error: {
            code: "stripe_not_ready",
            message: "Stripe onboarding is incomplete. Complete setup in Settings → Payments before accepting card payments.",
          },
        });
        return;
      }

      const feeBps = (tenant?.application_fee_bps as number) ?? 0;
      const appFeeCents = Math.round((total_cents * feeBps) / 10000);

      try {
        const pi = await createPaymentIntent({
          amount: total_cents,
          on_behalf_of: stripeAccountId,
          transfer_data: { destination: stripeAccountId },
          application_fee_amount: appFeeCents > 0 ? appFeeCents : undefined,
          metadata: { order_id: orderId, tenant_id: tenantId },
        });
        stripePaymentIntentId = pi.id;
        clientSecret = pi.client_secret ?? null;
      } catch (err: unknown) {
        res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
        return;
      }
    } else {
      // Mock mode (no STRIPE_SECRET_KEY) — generate stub IDs for testing
      const mockId = `pi_mock_${Date.now()}`;
      stripePaymentIntentId = mockId;
      clientSecret = `${mockId}_secret_mock`;
    }
  }

  // ── Insert payment row ────────────────────────────────────────────────────
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
      stripe_payment_intent_id: stripePaymentIntentId,
    })
    .select()
    .single();

  if (paymentErr) { res.status(500).json({ error: { code: "internal_error", message: paymentErr.message } }); return; }

  // Auto-confirm for cash/card_mock — recalcOrderTotals already wrote correct
  // tax_cents / total_cents to the order, so we only update status + tip here.
  if (isAutoConfirm) {
    await confirmPayment(db, payment.id, orderId, tenantId, tip_cents);
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

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "payment_created", target_type: "payment", target_id: payment.id, payload: { method: parsed.data.method, amount_cents: total_cents, tax_cents, auto_confirmed: isAutoConfirm, cash_session_id: cashSessionId }, ip_address: req.ip });

  // Return fresh order state alongside payment
  const { data: updatedOrder } = await db.from("orders").select("*").eq("id", orderId).single();

  res.status(201).json({
    payment,
    order: updatedOrder,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/payments/:pid/confirm — manual override (session only)
// ---------------------------------------------------------------------------
paymentsRouter.post(
  "/:pid/confirm",
  requireAuth({ kinds: ["session"] }),
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
