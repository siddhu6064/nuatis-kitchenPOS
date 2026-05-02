import { Router, type IRouter, type Request, type Response } from "express";
import { SignUpRequestSchema } from "@nuatis/pos-shared";
import { getSupabaseClient } from "../../lib/supabase.js";
import { hashPassword } from "../../lib/passwords.js";
import { logger } from "../../lib/logger.js";

export const onboardingRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /v1/onboarding/sign-up — public, no auth required
// Creates: tenant + default location + owner staff member
// ---------------------------------------------------------------------------
onboardingRouter.post(
  "/sign-up",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SignUpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const {
      business_name,
      vertical,
      full_name,
      email,
      password,
      timezone,
    } = parsed.data;

    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({
        error: { code: "service_unavailable", message: "Database not configured" },
      });
      return;
    }

    // 1. Check for duplicate email among owner/manager staff
    const { data: existing, error: checkErr } = await client
      .from("staff_members")
      .select("id")
      .eq("email", email)
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (checkErr) {
      logger.error({ err: checkErr }, "sign-up email check failed");
      res.status(500).json({ error: { code: "internal_error", message: "Sign-up failed" } });
      return;
    }

    if (existing) {
      res.status(409).json({
        error: { code: "email_taken", message: "An account with this email already exists" },
      });
      return;
    }

    // 2. Insert tenant
    const { data: tenant, error: tenantErr } = await client
      .from("tenants")
      .insert({ name: business_name, vertical, timezone })
      .select("id")
      .single();

    if (tenantErr || !tenant) {
      logger.error({ err: tenantErr }, "sign-up tenant insert failed");
      res.status(500).json({ error: { code: "internal_error", message: "Sign-up failed" } });
      return;
    }

    const tenant_id: string = tenant.id as string;

    // 3. Insert default location
    const { data: location, error: locationErr } = await client
      .from("locations")
      .insert({
        tenant_id,
        name: business_name,
        sales_tax_bps: 825,
        business_hours: null,
      })
      .select("id")
      .single();

    if (locationErr || !location) {
      logger.error({ err: locationErr }, "sign-up location insert failed");
      res.status(500).json({ error: { code: "internal_error", message: "Sign-up failed" } });
      return;
    }

    const location_id: string = location.id as string;

    // 4. Hash password
    const password_hash = await hashPassword(password);

    // 5. Insert owner staff member
    const { data: staff, error: staffErr } = await client
      .from("staff_members")
      .insert({
        tenant_id,
        location_ids: [location_id],
        full_name,
        email,
        role: "owner",
        password_hash,
        pin_hash: null,
      })
      .select("id")
      .single();

    if (staffErr || !staff) {
      logger.error({ err: staffErr }, "sign-up staff insert failed");
      res.status(500).json({ error: { code: "internal_error", message: "Sign-up failed" } });
      return;
    }

    const owner_staff_id: string = staff.id as string;

    // 6. Audit log
    const { error: auditErr } = await client.from("audit_log").insert({
      tenant_id,
      staff_id: owner_staff_id,
      action: "tenant_created",
      ip_address: req.ip ?? null,
    });

    if (auditErr) {
      logger.warn({ err: auditErr }, "sign-up audit log write failed (non-fatal)");
    }

    // 7. Respond
    res.status(201).json({
      tenant_id,
      location_id,
      owner_staff_id,
      message: "Account created. You can now sign in.",
    });
  }
);
