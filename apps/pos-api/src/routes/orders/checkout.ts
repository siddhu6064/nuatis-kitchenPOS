import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const checkoutRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/checkout — idempotent tax+tip preview, no DB writes
// ---------------------------------------------------------------------------
checkoutRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order (must be open or fired)
  const { data: order, error: orderErr } = await db.from("orders").select("id, status, location_id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (!["open", "fired"].includes(order.status as string)) { res.status(409).json({ error: { code: "conflict", message: `Cannot checkout order with status '${order.status as string}'` } }); return; }

  // Fetch non-voided items
  const { data: items, error: itemErr } = await db.from("order_items").select("name_snapshot, price_cents, qty, status").eq("order_id", orderId).neq("status", "voided");
  if (itemErr) { res.status(500).json({ error: { code: "internal_error", message: itemErr.message } }); return; }

  // Fetch location for tax rate
  const { data: location } = await db.from("locations").select("sales_tax_bps").eq("id", order.location_id).maybeSingle();
  const salesTaxBps: number = (location?.sales_tax_bps as number) ?? 825;

  const subtotal_cents = (items ?? []).reduce(
    (sum: number, i: { price_cents: number; qty: number }) => sum + i.price_cents * i.qty,
    0
  );
  const tax_cents = Math.round((subtotal_cents * salesTaxBps) / 10000);
  const tip_cents = 0; // Preview only — tip applied at payment time
  const total_cents = subtotal_cents + tax_cents + tip_cents;

  res.json({
    subtotal_cents,
    tax_cents,
    tip_cents,
    total_cents,
    sales_tax_bps: salesTaxBps,
    items: (items ?? []).map((i: { name_snapshot: string; price_cents: number; qty: number }) => ({
      name: i.name_snapshot,
      price_cents: i.price_cents,
      qty: i.qty,
    })),
  });
});
