import { Router, type IRouter, type Request, type Response } from "express";
import {
  UpdateTenantSettingsRequestSchema,
  UpdateLocationSettingsRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { writeAuditLog } from "../../lib/db.js";

export const settingsRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /v1/settings — tenant + all locations for this tenant
// ---------------------------------------------------------------------------
settingsRouter.get(
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

    const [tenantResult, locationsResult] = await Promise.all([
      db.from("tenants")
        .select("id, name, vertical, timezone, email_daily_report, daily_report_recipient_email")
        .eq("id", tenantId)
        .single(),
      db.from("locations")
        .select("id, tenant_id, name, sales_tax_bps, business_hours, address")
        .eq("tenant_id", tenantId)
        .order("name"),
    ]);

    if (tenantResult.error) {
      res.status(500).json({ error: { code: "internal_error", message: tenantResult.error.message } });
      return;
    }

    res.json({
      tenant: tenantResult.data,
      locations: locationsResult.data ?? [],
    });
  }
);

// ---------------------------------------------------------------------------
// PATCH /v1/settings/tenant — update tenant settings (owner only)
// ---------------------------------------------------------------------------
settingsRouter.patch(
  "/tenant",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = UpdateTenantSettingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch current for audit diff
    const { data: before } = await db
      .from("tenants")
      .select("name, vertical, timezone, email_daily_report, daily_report_recipient_email")
      .eq("id", tenantId)
      .single();

    const { data: updated, error } = await db
      .from("tenants")
      .update(parsed.data)
      .eq("id", tenantId)
      .select("id, name, vertical, timezone, email_daily_report, daily_report_recipient_email")
      .single();

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    // Redact sensitive opt-out fields in audit log
    const { daily_report_recipient_email: _email, ...auditBefore } = (before ?? {}) as Record<string, unknown>;
    const { daily_report_recipient_email: _emailAfter, ...auditAfter } = (updated ?? {}) as Record<string, unknown>;

    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: callerId,
      action: "tenant_settings_updated",
      target_type: "tenant",
      target_id: tenantId,
      payload: { before: auditBefore, after: auditAfter, email_changed: _email !== _emailAfter },
      ip_address: req.ip,
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// PATCH /v1/settings/locations/:id — update a single location (owner+manager)
// ---------------------------------------------------------------------------
settingsRouter.patch(
  "/locations/:id",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = UpdateLocationSettingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    const locationId = req.params["id"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: updated, error } = await db
      .from("locations")
      .update(parsed.data)
      .eq("id", locationId)
      .eq("tenant_id", tenantId)
      .select("id, tenant_id, name, sales_tax_bps, business_hours, address")
      .single();

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }
    if (!updated) {
      res.status(404).json({ error: { code: "not_found", message: "Location not found" } });
      return;
    }

    writeAuditLog(client, {
      tenant_id: tenantId,
      staff_id: callerId,
      action: "location_settings_updated",
      target_type: "location",
      target_id: locationId,
      payload: parsed.data,
      ip_address: req.ip,
    });

    res.json(updated);
  }
);
