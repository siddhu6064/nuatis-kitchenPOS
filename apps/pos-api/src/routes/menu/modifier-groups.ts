import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateModifierGroupRequestSchema,
  UpdateModifierGroupRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { tenantSelect, assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const modifierGroupsRouter: IRouter = Router();

const WRITE = [requireAuth({ kinds: ["session"] }), requireRole(["owner", "manager"])];
const READ = [requireAuth()];

// GET /v1/menu/modifier-groups  — returns groups with their options nested
modifierGroupsRouter.get("/", ...READ, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("modifier_groups")
    .select("*, modifier_options(*)")
    .eq("tenant_id", req.auth!.tenant_id)
    .is("deleted_at", null)
    .order("name");

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  // Rename embedded to `options`
  const groups = (data ?? []).map((g: Record<string, unknown>) => {
    const { modifier_options, ...rest } = g;
    return { ...rest, options: modifier_options };
  });

  res.json(groups);
});

// POST /v1/menu/modifier-groups
modifierGroupsRouter.post("/", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreateModifierGroupRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("modifier_groups")
    .insert({ ...parsed.data, tenant_id: req.auth!.tenant_id })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_group_created", target_type: "modifier_group", target_id: data.id, payload: data, ip_address: req.ip });

  res.status(201).json(data);
});

// PATCH /v1/menu/modifier-groups/:id
modifierGroupsRouter.patch("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = UpdateModifierGroupRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const owned = await assertTenantOwns(client, "modifier_groups", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Modifier group not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("modifier_groups")
    .update(parsed.data)
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_group_updated", target_type: "modifier_group", target_id: req.params["id"], payload: parsed.data, ip_address: req.ip });

  res.json(data);
});

// DELETE /v1/menu/modifier-groups/:id — soft delete
modifierGroupsRouter.delete("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const owned = await assertTenantOwns(client, "modifier_groups", req.params["id"]!, req.auth!.tenant_id).catch(() => false);
  if (!owned) { res.status(404).json({ error: { code: "not_found", message: "Modifier group not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("modifier_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", req.params["id"])
    .eq("tenant_id", req.auth!.tenant_id);

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_group_deleted", target_type: "modifier_group", target_id: req.params["id"], ip_address: req.ip });

  res.status(204).send();
});
