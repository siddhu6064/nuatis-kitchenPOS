import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const linksRouter: IRouter = Router({ mergeParams: true });

const WRITE = [requireAuth({ kinds: ["session"] }), requireRole(["owner", "manager"])];

const LinkBodySchema = z.object({
  group_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative().default(0),
});

// POST /v1/menu/items/:item_id/modifier-groups
linksRouter.post("/", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = LinkBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const item_id = req.params["item_id"]!;

  const [itemOwned, groupOwned] = await Promise.all([
    assertTenantOwns(client, "menu_items", item_id, req.auth!.tenant_id).catch(() => false),
    assertTenantOwns(client, "modifier_groups", parsed.data.group_id, req.auth!.tenant_id).catch(() => false),
  ]);

  if (!itemOwned || !groupOwned) {
    res.status(404).json({ error: { code: "not_found", message: "Item or modifier group not found" } });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("menu_item_modifier_groups")
    .insert({ item_id, group_id: parsed.data.group_id, sort_order: parsed.data.sort_order })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "item_modifier_group_linked", target_type: "menu_item", target_id: item_id, payload: data, ip_address: req.ip });

  res.status(201).json(data);
});

// DELETE /v1/menu/items/:item_id/modifier-groups/:group_id
linksRouter.delete("/:group_id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const item_id = req.params["item_id"]!;
  const group_id = req.params["group_id"]!;

  const [itemOwned, groupOwned] = await Promise.all([
    assertTenantOwns(client, "menu_items", item_id, req.auth!.tenant_id).catch(() => false),
    assertTenantOwns(client, "modifier_groups", group_id, req.auth!.tenant_id).catch(() => false),
  ]);

  if (!itemOwned || !groupOwned) {
    res.status(404).json({ error: { code: "not_found", message: "Item or modifier group not found" } });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("menu_item_modifier_groups")
    .delete()
    .eq("item_id", item_id)
    .eq("group_id", group_id);

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "item_modifier_group_unlinked", target_type: "menu_item", target_id: item_id, payload: { group_id }, ip_address: req.ip });

  res.status(204).send();
});
