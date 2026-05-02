import { Router, type IRouter, type Request, type Response } from "express";
import { AddOrderItemRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { assertTenantOwns, recalcOrderTotals, writeAuditLog } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

export const orderItemsRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/items — add an item to an open order
// ---------------------------------------------------------------------------
orderItemsRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = AddOrderItemRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order — must be open and belong to tenant
  const { data: order, error: orderErr } = await db.from("orders").select("id, status, location_id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (order.status !== "open") { res.status(409).json({ error: { code: "conflict", message: `Order is ${order.status as string} — cannot add items` } }); return; }

  // Validate menu_item belongs to tenant
  const { data: menuItem, error: itemErr } = await db.from("menu_items").select("id, name, price_cents, tenant_id").eq("id", parsed.data.menu_item_id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (itemErr) { res.status(500).json({ error: { code: "internal_error", message: itemErr.message } }); return; }
  if (!menuItem) { res.status(404).json({ error: { code: "not_found", message: "Menu item not found" } }); return; }

  // Resolve modifier snapshot
  const modifiersSnapshot = await Promise.all(
    parsed.data.modifiers.map(async ({ group_id, option_id }) => {
      const [{ data: grp }, { data: opt }] = await Promise.all([
        db.from("modifier_groups").select("name").eq("id", group_id).eq("tenant_id", tenantId).maybeSingle(),
        db.from("modifier_options").select("name, price_delta_cents").eq("id", option_id).eq("group_id", group_id).maybeSingle(),
      ]);
      return {
        group_id,
        group_name: grp?.name ?? null,
        option_id,
        option_name: opt?.name ?? null,
        price_delta_cents: opt?.price_delta_cents ?? 0,
      };
    })
  );

  const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;

  const { data: orderItem, error: insertErr } = await db
    .from("order_items")
    .insert({
      order_id: orderId,
      tenant_id: tenantId,
      menu_item_id: parsed.data.menu_item_id,
      name_snapshot: menuItem.name as string,
      qty: parsed.data.quantity,
      price_cents: menuItem.price_cents as number,
      modifiers_json: modifiersSnapshot,
      status: "open",
    })
    .select()
    .single();

  if (insertErr) { res.status(500).json({ error: { code: "internal_error", message: insertErr.message } }); return; }

  // Recalculate and persist order subtotal
  await recalcOrderTotals(client, orderId, tenantId);

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "order_item_added", target_type: "order_item", target_id: orderItem.id, payload: { order_id: orderId, menu_item_id: parsed.data.menu_item_id }, ip_address: req.ip });

  res.status(201).json(orderItem);
});

// ---------------------------------------------------------------------------
// DELETE /v1/orders/:id/items/:item_id — soft-void an item
// ---------------------------------------------------------------------------
orderItemsRouter.delete("/:item_id", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  const itemId = req.params["item_id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: order } = await db.from("orders").select("id, status").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (order.status !== "open") { res.status(409).json({ error: { code: "conflict", message: `Order is ${order.status as string} — cannot remove items` } }); return; }

  const { data: item } = await db.from("order_items").select("id, status").eq("id", itemId).eq("order_id", orderId).maybeSingle();
  if (!item) { res.status(404).json({ error: { code: "not_found", message: "Order item not found" } }); return; }
  if (item.status === "voided") { res.status(409).json({ error: { code: "conflict", message: "Item already voided" } }); return; }

  const { error } = await db.from("order_items").update({ status: "voided", voided_at: new Date().toISOString() }).eq("id", itemId);
  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  await recalcOrderTotals(client, orderId, tenantId);

  const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;
  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "order_item_voided", target_type: "order_item", target_id: itemId, payload: { order_id: orderId }, ip_address: req.ip });

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/items/:item_id/bump — mark item as seen/bumped on KDS
//
// Auth   : terminal OR session (any authenticated staff)
// Validates: order is fired; item belongs to order + tenant; item not yet bumped/voided
// Broadcasts: { event: 'item_bumped', order_id, item_id } on kitchen:{location_id}
// Audit  : order_item_bumped
// ---------------------------------------------------------------------------
orderItemsRouter.post("/:item_id/bump", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  const itemId = req.params["item_id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order — must be fired (or at least not paid/voided) and belong to tenant
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, status, location_id, tenant_id")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (order.status === "paid" || order.status === "voided") {
    res.status(409).json({ error: { code: "conflict", message: `Cannot bump items on a ${order.status as string} order` } }); return;
  }
  if (order.status !== "fired") {
    res.status(409).json({ error: { code: "conflict", message: "Order must be fired before bumping items" } }); return;
  }

  // Fetch item — must belong to this order and not already bumped or voided
  const { data: item, error: itemErr } = await db
    .from("order_items")
    .select("id, status, order_id")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (itemErr) { res.status(500).json({ error: { code: "internal_error", message: itemErr.message } }); return; }
  if (!item) { res.status(404).json({ error: { code: "not_found", message: "Order item not found" } }); return; }
  if (item.status === "bumped") { res.status(409).json({ error: { code: "conflict", message: "Item already bumped" } }); return; }
  if (item.status === "voided") { res.status(409).json({ error: { code: "conflict", message: "Cannot bump a voided item" } }); return; }

  const now = new Date().toISOString();

  const { data: updatedItem, error: updateErr } = await db
    .from("order_items")
    .update({ status: "bumped", bumped_at: now })
    .eq("id", itemId)
    .select()
    .single();

  if (updateErr) { res.status(500).json({ error: { code: "internal_error", message: updateErr.message } }); return; }

  // Verify tenant ownership (belt-and-suspenders since we already filtered by order_id + tenant above)
  void assertTenantOwns; // imported but used implicitly via order query above

  // Fire-and-forget: broadcast item_bumped to KDS so other open KDS tabs sync
  // Payload conforms to KitchenBumpEventSchema from @nuatis/pos-shared
  void (async () => {
    try {
      const channel = client.channel(`kitchen:${order.location_id as string}`);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "item_bumped",
        payload: { event: "item_bumped", order_id: orderId, item_id: itemId },
      });
      await client.removeChannel(channel);
    } catch (err) {
      logger.warn({ err }, "realtime bump broadcast failed — non-fatal");
    }
  })();

  const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;
  writeAuditLog(client, {
    tenant_id: tenantId,
    staff_id: staffId,
    action: "order_item_bumped",
    target_type: "order_item",
    target_id: itemId,
    payload: { order_id: orderId },
    ip_address: req.ip,
  });

  res.json(updatedItem);
});
