import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateModifierOptionRequestSchema,
  UpdateModifierOptionRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const modifierOptionsRouter: IRouter = Router();

const WRITE = [requireAuth({ kinds: ["session"] }), requireRole(["owner", "manager"])];

// POST /v1/menu/modifier-options
modifierOptionsRouter.post("/", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreateModifierOptionRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  // Verify group belongs to this tenant
  const groupOwned = await assertTenantOwns(client, "modifier_groups", parsed.data.group_id, req.auth!.tenant_id).catch(() => false);
  if (!groupOwned) { res.status(404).json({ error: { code: "not_found", message: "Modifier group not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("modifier_options")
    .insert(parsed.data)
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_option_created", target_type: "modifier_option", target_id: data.id, payload: data, ip_address: req.ip });

  res.status(201).json(data);
});

// PATCH /v1/menu/modifier-options/:id
modifierOptionsRouter.patch("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = UpdateModifierOptionRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  // Verify option exists by id (no tenant_id on modifier_options — scoped via group)
  // We verify the group's tenant as a proxy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (client as any)
    .from("modifier_options")
    .select("id, group_id")
    .eq("id", req.params["id"])
    .maybeSingle();

  if (fetchErr) { res.status(500).json({ error: { code: "internal_error", message: fetchErr.message } }); return; }
  if (!existing) { res.status(404).json({ error: { code: "not_found", message: "Modifier option not found" } }); return; }

  const groupOwned = await assertTenantOwns(client, "modifier_groups", existing.group_id, req.auth!.tenant_id).catch(() => false);
  if (!groupOwned) { res.status(404).json({ error: { code: "not_found", message: "Modifier option not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("modifier_options")
    .update(parsed.data)
    .eq("id", req.params["id"])
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_option_updated", target_type: "modifier_option", target_id: req.params["id"], payload: parsed.data, ip_address: req.ip });

  res.json(data);
});

// DELETE /v1/menu/modifier-options/:id — HARD delete (options not historically referenced)
modifierOptionsRouter.delete("/:id", ...WRITE, async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (client as any)
    .from("modifier_options")
    .select("id, group_id")
    .eq("id", req.params["id"])
    .maybeSingle();

  if (fetchErr) { res.status(500).json({ error: { code: "internal_error", message: fetchErr.message } }); return; }
  if (!existing) { res.status(404).json({ error: { code: "not_found", message: "Modifier option not found" } }); return; }

  const groupOwned = await assertTenantOwns(client, "modifier_groups", existing.group_id, req.auth!.tenant_id).catch(() => false);
  if (!groupOwned) { res.status(404).json({ error: { code: "not_found", message: "Modifier option not found" } }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("modifier_options")
    .delete()
    .eq("id", req.params["id"]);

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  const staff_id = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
  writeAuditLog(client, { tenant_id: req.auth!.tenant_id, staff_id, action: "modifier_option_deleted", target_type: "modifier_option", target_id: req.params["id"], ip_address: req.ip });

  res.status(204).send();
});
