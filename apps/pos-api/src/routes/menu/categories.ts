import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateMenuCategoryRequestSchema,
  UpdateMenuCategoryRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { tenantSelect, assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const categoriesRouter: IRouter = Router();

const WRITE = [requireAuth({ kinds: ["session"] }), requireRole(["owner", "manager"])];
const READ = [requireAuth()];

// GET /v1/menu/categories
categoriesRouter.get("/", ...READ, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const { data, error } = await tenantSelect(client, "menu_categories", req.auth!.tenant_id)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }
  res.json(data);
});

// POST /v1/menu/categories
categoriesRouter.post("/", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreateMenuCategoryRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("menu_categories")
    .insert({ ...parsed.data, tenant_id: req.auth!.tenant_id })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_category_created", target_type: "menu_category", target_id: data.id, payload: data, ip_address: req.ip });

  res.status(201).json(data);
});

// PATCH /v1/menu/categories/:id
categoriesRouter.patch("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = UpdateMenuCategoryRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const owned = await assertTenantOwns(client, "menu_categories", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Category not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("menu_categories")
    .update(parsed.data)
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_category_updated", target_type: "menu_category", target_id: req.params["id"], payload: parsed.data, ip_address: req.ip });

  res.json(data);
});

// DELETE /v1/menu/categories/:id  — soft delete
categoriesRouter.delete("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const owned = await assertTenantOwns(client, "menu_categories", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Category not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("menu_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id);

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "menu_category_deleted", target_type: "menu_category", target_id: req.params["id"], ip_address: req.ip });

  res.status(204).send();
});
