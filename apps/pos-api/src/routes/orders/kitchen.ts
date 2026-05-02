import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { writeAuditLog } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

export const kitchenRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /v1/orders/:id/send-to-kitchen
// Transitions all open order_items to 'fired', order to 'fired',
// and broadcasts to the KDS via Supabase Realtime.
//
// Broadcast channel : kitchen:{location_id}
// Broadcast event   : order_fired
// Payload schema    : KitchenBroadcastEventSchema (packages/pos-shared)
// ---------------------------------------------------------------------------
kitchenRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  const orderId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order — must be open; select all columns so order_number + opened_at are available
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (orderErr) { res.status(500).json({ error: { code: "internal_error", message: orderErr.message } }); return; }
  if (!order) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (order.status !== "open") { res.status(409).json({ error: { code: "conflict", message: `Order is already ${order.status as string}` } }); return; }

  const now = new Date().toISOString();

  // Fire all open order_items — fetch full rows for broadcast payload
  const { data: firedItems, error: itemErr } = await db
    .from("order_items")
    .update({ status: "fired", fired_at: now })
    .eq("order_id", orderId)
    .eq("status", "open")
    .select();

  if (itemErr) { res.status(500).json({ error: { code: "internal_error", message: itemErr.message } }); return; }

  // Transition order status to fired
  const { data: updatedOrder, error: updateErr } = await db
    .from("orders")
    .update({ status: "fired", updated_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (updateErr) { res.status(500).json({ error: { code: "internal_error", message: updateErr.message } }); return; }

  const staffId = req.auth!.kind === "terminal" ? req.auth!.staff_id : req.auth!.user_id;

  // Fire-and-forget Realtime broadcast to KDS channel
  // Payload conforms to KitchenBroadcastEventSchema from @nuatis/pos-shared
  void (async () => {
    try {
      const channel = client.channel(`kitchen:${order.location_id as string}`);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "order_fired",
        payload: {
          event: "order_fired",
          order_id: orderId,
          location_id: order.location_id as string,
          order_number: (order.order_number as number) ?? 0,
          opened_at: order.opened_at as string,
          items: (firedItems ?? []).map((i: Record<string, unknown>) => ({
            id: i["id"],
            name: i["name_snapshot"],
            quantity: i["qty"],
            modifiers: Array.isArray(i["modifiers_json"])
              ? (i["modifiers_json"] as Array<Record<string, unknown>>).map((m) => ({
                  group_name: (m["group_name"] as string | undefined) ?? "",
                  option_name: (m["option_name"] as string | undefined) ?? "",
                }))
              : [],
          })),
        },
      });
      await client.removeChannel(channel);
    } catch (err) {
      logger.warn({ err }, "realtime broadcast failed — non-fatal");
    }
  })();

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "order_sent_to_kitchen", target_type: "order", target_id: orderId, ip_address: req.ip });

  res.json(updatedOrder);
});
