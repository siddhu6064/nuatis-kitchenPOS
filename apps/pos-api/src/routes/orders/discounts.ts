import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireManagerPin } from "../../middleware/manager-pin.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { recalcOrderTotals, writeAuditLog } from "../../lib/db.js";

export const orderDiscountsRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ApplyDiscountRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pct"),
    value: z.number().int().min(1).max(5000), // bps; 5000 = 50% cap
    reason: z.string().min(1).max(200),
    manager_pin: z.string().optional(), // consumed by middleware
  }),
  z.object({
    type: z.literal("amt"),
    value: z.number().int().min(1),
    reason: z.string().min(1).max(200),
    manager_pin: z.string().optional(), // consumed by middleware
  }),
]);

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/discount — apply ad-hoc discount (always PIN-gated)
// ---------------------------------------------------------------------------
orderDiscountsRouter.post(
  "/",
  requireAuth(),
  requireManagerPin(),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = ApplyDiscountRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    const staffId =
      req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;
    const managerId = req.manager_id!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch order
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("id, status, subtotal_cents")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (orderErr) {
      res.status(500).json({ error: { code: "internal_error", message: orderErr.message } });
      return;
    }
    if (!order) {
      res.status(404).json({ error: { code: "not_found", message: "Order not found" } });
      return;
    }

    const status = order.status as string;
    if (status === "paid" || status === "voided") {
      res.status(409).json({
        error: {
          code: "conflict",
          message: `Cannot apply discount to an order with status '${status}'`,
        },
      });
      return;
    }

    const { type, value, reason } = parsed.data;
    const subtotal_cents = order.subtotal_cents as number;

    // Validate amt discount does not exceed current subtotal
    if (type === "amt" && value > subtotal_cents) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: `Fixed discount (${value} cents) exceeds order subtotal (${subtotal_cents} cents)`,
        },
      });
      return;
    }

    // Insert discount row (applied_amount_cents will be set by recalcOrderTotals)
    const insertPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      order_id: orderId,
      type,
      applied_by_staff_id: managerId,
      reason,
      applied_amount_cents: 0, // will be recomputed immediately below
    };

    if (type === "pct") {
      insertPayload["value_bps"] = value;
    } else {
      insertPayload["value_cents"] = value;
    }

    const { data: discountRow, error: insertErr } = await db
      .from("order_discounts")
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      res.status(500).json({ error: { code: "internal_error", message: insertErr.message } });
      return;
    }

    // Recompute all order totals (persists applied_amount_cents on discount row + order totals)
    await recalcOrderTotals(client, orderId, tenantId);

    // Audit log — fire-and-forget
    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: staffId,
      action: "discount_applied",
      target_type: "order",
      target_id: orderId,
      payload: {
        order_id: orderId,
        discount_id: discountRow.id as string,
        type,
        value,
        reason,
        manager_id: managerId,
      },
      ip_address: req.ip,
    });

    // Return the updated order with discounts and items
    const [orderRes, itemsRes, discountsRes, paymentsRes] = await Promise.all([
      db.from("orders").select("*").eq("id", orderId).eq("tenant_id", tenantId).single(),
      db.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      db.from("order_discounts").select("*").eq("order_id", orderId).eq("tenant_id", tenantId).order("applied_at"),
      db.from("payments").select("*").eq("order_id", orderId).eq("tenant_id", tenantId).order("created_at"),
    ]);

    res.json({
      ...orderRes.data,
      items: itemsRes.data ?? [],
      discounts: discountsRes.data ?? [],
      payments: paymentsRes.data ?? [],
    });
  }
);

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/discount/:application_id/void — void a discount (PIN-gated)
// ---------------------------------------------------------------------------
orderDiscountsRouter.post(
  "/:application_id/void",
  requireAuth(),
  requireManagerPin(),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    const applicationId = req.params["application_id"]!;
    const staffId =
      req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;
    const managerId = req.manager_id!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch the discount row
    const { data: discount, error: discountErr } = await db
      .from("order_discounts")
      .select("id, order_id, tenant_id, voided_at, reason")
      .eq("id", applicationId)
      .eq("order_id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (discountErr) {
      res.status(500).json({ error: { code: "internal_error", message: discountErr.message } });
      return;
    }
    if (!discount) {
      res.status(404).json({ error: { code: "not_found", message: "Discount not found" } });
      return;
    }
    if (discount.voided_at) {
      res.status(409).json({ error: { code: "conflict", message: "Discount already voided" } });
      return;
    }

    // Soft-delete: set voided_at + voided_by_staff_id
    const now = new Date().toISOString();
    const { error: voidErr } = await db
      .from("order_discounts")
      .update({ voided_at: now, voided_by_staff_id: managerId })
      .eq("id", applicationId);

    if (voidErr) {
      res.status(500).json({ error: { code: "internal_error", message: voidErr.message } });
      return;
    }

    // Recompute order totals without this discount
    await recalcOrderTotals(client, orderId, tenantId);

    // Audit log — fire-and-forget
    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: staffId,
      action: "discount_voided",
      target_type: "order",
      target_id: orderId,
      payload: {
        order_id: orderId,
        application_id: applicationId,
        reason: discount.reason as string,
        manager_id: managerId,
      },
      ip_address: req.ip,
    });

    // Return updated order
    const [orderRes, itemsRes, discountsRes, paymentsRes] = await Promise.all([
      db.from("orders").select("*").eq("id", orderId).eq("tenant_id", tenantId).single(),
      db.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
      db.from("order_discounts").select("*").eq("order_id", orderId).eq("tenant_id", tenantId).order("applied_at"),
      db.from("payments").select("*").eq("order_id", orderId).eq("tenant_id", tenantId).order("created_at"),
    ]);

    res.json({
      ...orderRes.data,
      items: itemsRes.data ?? [],
      discounts: discountsRes.data ?? [],
      payments: paymentsRes.data ?? [],
    });
  }
);
