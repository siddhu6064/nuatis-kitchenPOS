import { Router, type IRouter, type Request, type Response } from "express";
import { InviteStaffRequestSchema, UpdateStaffRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { hashPin } from "../../lib/passwords.js";
import { writeAuditLog } from "../../lib/db.js";

export const staffRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /v1/staff — list all staff for the authenticated tenant
// ---------------------------------------------------------------------------
staffRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data, error } = await db
      .from("staff_members")
      .select("id, tenant_id, full_name, email, role, active, location_ids, pin_hash, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    const safe = ((data ?? []) as Array<{
      id: string; tenant_id: string; full_name: string; email: string | null;
      role: string; active: boolean; location_ids: string[] | null;
      pin_hash: string | null; created_at: string;
    }>).map((m) => ({
      id: m.id,
      tenant_id: m.tenant_id,
      full_name: m.full_name,
      email: m.email,
      role: m.role,
      active: m.active ?? true,
      location_ids: m.location_ids,
      has_pin: m.pin_hash !== null,
      created_at: m.created_at,
    }));

    res.json(safe);
  }
);

// ---------------------------------------------------------------------------
// POST /v1/staff — invite a new staff member
// ---------------------------------------------------------------------------
staffRouter.post(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = InviteStaffRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    const { full_name, email, role, pin, location_ids } = parsed.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const pin_hash = pin ? await hashPin(pin) : null;

    const { data: member, error } = await db
      .from("staff_members")
      .insert({
        tenant_id: tenantId,
        full_name,
        email: email ?? null,
        role,
        pin_hash,
        active: true,
        location_ids: location_ids ?? null,
      })
      .select("id, tenant_id, full_name, email, role, active, location_ids, pin_hash, created_at")
      .single();

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: callerId,
      action: "staff_invited",
      target_type: "staff_member",
      target_id: member.id as string,
      payload: { role, email: email ?? null, full_name },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: member.id,
      tenant_id: member.tenant_id,
      full_name: member.full_name,
      email: member.email,
      role: member.role,
      active: member.active ?? true,
      location_ids: member.location_ids,
      has_pin: member.pin_hash !== null,
      created_at: member.created_at,
    });
  }
);

// ---------------------------------------------------------------------------
// PATCH /v1/staff/:id — update a staff member
// ---------------------------------------------------------------------------
staffRouter.patch(
  "/:id",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = UpdateStaffRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    const staffId = req.params["id"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch existing record (tenant-scoped)
    const { data: existing, error: fetchErr } = await db
      .from("staff_members")
      .select("id, role, active, pin_hash")
      .eq("id", staffId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (fetchErr) { res.status(500).json({ error: { code: "internal_error", message: fetchErr.message } }); return; }
    if (!existing) { res.status(404).json({ error: { code: "not_found", message: "Staff member not found" } }); return; }

    // Prevent self-deactivation
    if (parsed.data.active === false && staffId === callerId) {
      res.status(400).json({ error: { code: "cannot_deactivate_self", message: "You cannot deactivate yourself" } });
      return;
    }

    // Prevent deactivating the last active owner
    if (parsed.data.active === false && existing.role === "owner") {
      const { count } = await db
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("role", "owner")
        .eq("active", true);

      if ((count ?? 0) <= 1) {
        res.status(400).json({ error: { code: "last_owner", message: "Cannot deactivate the last active owner" } });
        return;
      }
    }

    const { pin, ...rest } = parsed.data;
    const updates: Record<string, unknown> = { ...rest };

    if (pin !== undefined) {
      updates["pin_hash"] = await hashPin(pin);
    }

    const { data: updated, error: updateErr } = await db
      .from("staff_members")
      .update(updates)
      .eq("id", staffId)
      .eq("tenant_id", tenantId)
      .select("id, tenant_id, full_name, email, role, active, location_ids, pin_hash, created_at")
      .single();

    if (updateErr) { res.status(500).json({ error: { code: "internal_error", message: updateErr.message } }); return; }

    // Audit: role change
    if (rest.role && rest.role !== existing.role) {
      writeAuditLog(client, {
        tenant_id: tenantId,
        staff_id: callerId,
        action: "staff_role_changed",
        target_type: "staff_member",
        target_id: staffId,
        payload: { old_role: existing.role, new_role: rest.role },
        ip_address: req.ip,
      });
    }

    // Audit: PIN changed (field changed, not value)
    if (pin !== undefined) {
      writeAuditLog(client, {
        tenant_id: tenantId,
        staff_id: callerId,
        action: "staff_pin_changed",
        target_type: "staff_member",
        target_id: staffId,
        payload: { field: "pin" },
        ip_address: req.ip,
      });
    }

    res.json({
      id: updated.id,
      tenant_id: updated.tenant_id,
      full_name: updated.full_name,
      email: updated.email,
      role: updated.role,
      active: updated.active ?? true,
      location_ids: updated.location_ids,
      has_pin: updated.pin_hash !== null,
      created_at: updated.created_at,
    });
  }
);

// ---------------------------------------------------------------------------
// DELETE /v1/staff/:id — soft-delete (set active=false)
// ---------------------------------------------------------------------------
staffRouter.delete(
  "/:id",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    const staffId = req.params["id"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    if (staffId === callerId) {
      res.status(400).json({ error: { code: "cannot_deactivate_self", message: "You cannot deactivate yourself" } });
      return;
    }

    const { data: existing, error: fetchErr } = await db
      .from("staff_members")
      .select("id, role, active")
      .eq("id", staffId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (fetchErr) { res.status(500).json({ error: { code: "internal_error", message: fetchErr.message } }); return; }
    if (!existing) { res.status(404).json({ error: { code: "not_found", message: "Staff member not found" } }); return; }

    if (existing.role === "owner") {
      const { count } = await db
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("role", "owner")
        .eq("active", true);

      if ((count ?? 0) <= 1) {
        res.status(400).json({ error: { code: "last_owner", message: "Cannot deactivate the last active owner" } });
        return;
      }
    }

    await db
      .from("staff_members")
      .update({ active: false })
      .eq("id", staffId)
      .eq("tenant_id", tenantId);

    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: callerId,
      action: "staff_deactivated",
      target_type: "staff_member",
      target_id: staffId,
      payload: { previous_role: existing.role },
      ip_address: req.ip,
    });

    res.status(204).send();
  }
);
