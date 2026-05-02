import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { VoidOrderRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireManagerPin } from "../../middleware/manager-pin.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { writeAuditLog } from "../../lib/db.js";

export const voidRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/void
//
// Auth rules:
//   • Session JWT with role owner/manager → can void directly (no PIN needed).
//   • Terminal JWT (cashier) OR any other caller → requires manager PIN in body.
//
// Manager PIN flow (cashier path):
//   1. Cashier calls without manager_pin → 403 manager_pin_required
//   2. Manager enters PIN on terminal → cashier retries with { manager_pin: "XXXX" }
//   3. PIN validated against all owner/manager staff → req.manager_id set → proceed
// ---------------------------------------------------------------------------
voidRouter.post(
  "/",
  requireAuth(),
  // Gate: skip PIN check for session users with manager-level role
  (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth!;
    if (auth.kind === "session" && (auth.role === "owner" || auth.role === "manager")) {
      next();
      return;
    }
    void requireManagerPin()(req, res, next);
  },
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const parsed = VoidOrderRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: order, error: orderErr } = await db.from("orders").select("id, status").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
    if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
    if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }

    if (order.status === "paid") { res.status(409).json({ error: { code: "conflict", message: "Cannot void a paid order" } }); return; }
    if (order.status === "voided") { res.status(409).json({ error: { code: "conflict", message: "Order already voided" } }); return; }

    const now = new Date().toISOString();

    const { data: voidedOrder, error: voidErr } = await db
      .from("orders")
      .update({ status: "voided", voided_at: now, updated_at: now })
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (voidErr) { res.status(500).json({ error: { code: "internal_error", message: voidErr.message } }); return; }

    await db.from("order_items").update({ status: "voided", voided_at: now }).eq("order_id", orderId).in("status", ["open", "fired"]);
    await db.from("payments").update({ status: "voided", updated_at: now }).eq("order_id", orderId).eq("tenant_id", tenantId).eq("status", "requires_payment_method");

    const auth = req.auth!;
    const staffId = auth.kind === "terminal" ? auth.staff_id : auth.user_id;

    writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "order_voided", target_type: "order", target_id: orderId, payload: { reason: parsed.data.reason, manager_override: req.manager_id ? true : false }, ip_address: req.ip });

    // Log manager PIN override when a cashier voided with manager approval
    if (req.manager_id) {
      writeAuditLog(client, { tenant_id: tenantId, staff_id: req.manager_id, action: "manager_pin_override", target_type: "order", target_id: orderId, payload: { original_action: "order_voided", approved_for_staff_id: staffId }, ip_address: req.ip });
    }

    res.json(voidedOrder);
  }
);
