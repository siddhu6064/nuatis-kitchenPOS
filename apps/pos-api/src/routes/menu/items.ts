import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateMenuItemRequestSchema,
  UpdateMenuItemRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { tenantSelect, assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const itemsRouter: IRouter = Router();

const WRITE = [requireAuth({ kinds: ["session"] }), requireRole(["owner", "manager"])];
const READ = [requireAuth()];

// GET /v1/menu/items
itemsRouter.get("/", ...READ, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const { category_id, include_deleted } = req.query as Record<string, string | undefined>;
  const canSeeDeleted = req.auth!.kind === "session" && include_deleted === "true";

  let q = tenantSelect(client, "menu_items", req.auth!.tenant_id);

  if (!canSeeDeleted) q = q.is("deleted_at", null);
  if (category_id) q = q.eq("category_id", category_id);

  const { data, error } = await q.order("name");
  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }
  res.json(data);
});

// POST /v1/menu/items
itemsRouter.post("/", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreateMenuItemRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  // Verify category belongs to this tenant
  const categoryOwned = await assertTenantOwns(client, "menu_categories", parsed.data.category_id, req.auth!.tenant_id).catch(() => false);
  if (!categoryOwned) { res.status(404).json({ error: { code: "not_found", message: "Category not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("menu_items")
    .insert({ ...parsed.data, tenant_id: req.auth!.tenant_id })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_item_created", target_type: "menu_item", target_id: data.id, payload: data, ip_address: req.ip });

  res.status(201).json(data);
});

// PATCH /v1/menu/items/:id
itemsRouter.patch("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = UpdateMenuItemRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const owned = await assertTenantOwns(client, "menu_items", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Item not found" } }); return; }

  // If category_id is changing, verify new category also belongs to tenant
  if (parsed.data.category_id) {
    const catOwned = await assertTenantOwns(client, "menu_categories", parsed.data.category_id, req.auth!.tenant_id).catch(() => false);
    if (!catOwned) { res.status(404).json({ error: { code: "not_found", message: "Category not found" } }); return; }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("menu_items")
    .update(parsed.data)
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_item_updated", target_type: "menu_item", target_id: req.params["id"], payload: parsed.data, ip_address: req.ip });

  res.json(data);
});

// DELETE /v1/menu/items/:id — soft delete
itemsRouter.delete("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const owned = await assertTenantOwns(client, "menu_items", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Item not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("menu_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id);

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_item_deleted", target_type: "menu_item", target_id: req.params["id"], ip_address: req.ip });

  res.status(204).send();
});
