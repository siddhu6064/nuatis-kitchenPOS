import { Router, type IRouter, type Request, type Response } from "express";
import { VoidOrderRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { writeAuditLog } from "../../lib/db.js";

export const voidRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/void — owner/manager (session JWT) only
// ---------------------------------------------------------------------------
voidRouter.post(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
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

    // Void the order
    const { data: voidedOrder, error: voidErr } = await db
      .from("orders")
      .update({ status: "voided", voided_at: now, updated_at: now })
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (voidErr) { res.status(500).json({ error: { code: "internal_error", message: voidErr.message } }); return; }

    // Void all non-voided order_items
    await db.from("order_items").update({ status: "voided", voided_at: now }).eq("order_id", orderId).in("status", ["open", "fired"]);

    // Void any pending payment
    await db.from("payments").update({ status: "voided", updated_at: now }).eq("order_id", orderId).eq("tenant_id", tenantId).eq("status", "requires_payment_method");

    const sessionAuth = req.auth! as { user_id: string };
    writeAuditLog(client, { tenant_id: tenantId, staff_id: sessionAuth.user_id, action: "order_voided", target_type: "order", target_id: orderId, payload: { reason: parsed.data.reason }, ip_address: req.ip });

    res.json(voidedOrder);
  }
);
