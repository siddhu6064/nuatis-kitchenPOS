import { Router, type IRouter, type Request, type Response } from "express";
import {
  SignInRequestSchema,
  PinRequestSchema,
  type SessionJwtPayload,
} from "@nuatis/pos-shared";
import { getSupabaseClient } from "../lib/supabase.js";
import { signSessionJwt, signTerminalJwt } from "../lib/jwt.js";
import { verifyPassword, verifyPin } from "../lib/passwords.js";
import { logger } from "../lib/logger.js";

export const authRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeAuditLog(params: {
  tenant_id: string | null;
  staff_id: string | null;
  action: string;
  ip_address: string | undefined;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !params.tenant_id) return;
  const { error } = await client.from("audit_log").insert({
    tenant_id: params.tenant_id,
    staff_id: params.staff_id ?? null,
    action: params.action,
    ip_address: params.ip_address ?? null,
  });
  if (error) {
    logger.warn({ err: error }, "audit_log write failed");
  }
}

// ---------------------------------------------------------------------------
// POST /v1/auth/sign-in — email + password for owner/manager
// ---------------------------------------------------------------------------
authRouter.post(
  "/sign-in",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SignInRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid request body", details: parsed.error.flatten() },
      });
      return;
    }

    const { email, password } = parsed.data;

    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({
        error: { code: "service_unavailable", message: "Database not configured" },
      });
      return;
    }

    // Lookup staff by email — always use generic error to prevent user enumeration
    const { data: staff, error: queryError } = await client
      .from("staff_members")
      .select("id, tenant_id, email, role, password_hash")
      .eq("email", email)
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (queryError) {
      logger.error({ err: queryError }, "sign-in DB query failed");
      res.status(500).json({ error: { code: "internal_error", message: "Authentication failed" } });
      return;
    }

    let authenticated = false;
    if (staff?.password_hash) {
      authenticated = await verifyPassword(password, staff.password_hash as string);
    }

    if (!authenticated || !staff) {
      // Log failure (with whatever tenant_id we may have found)
      void writeAuditLog({
        tenant_id: staff?.tenant_id ?? null,
        staff_id: null,
        action: "staff_sign_in_failed",
        ip_address: req.ip,
      });
      res.status(401).json({
        error: { code: "unauthorized", message: "Invalid credentials" },
      });
      return;
    }

    const { token, expires_at } = await signSessionJwt({
      tenant_id: staff.tenant_id as string,
      user_id: staff.id as string,
      role: staff.role as SessionJwtPayload["role"],
    });

    void writeAuditLog({
      tenant_id: staff.tenant_id as string,
      staff_id: staff.id as string,
      action: "staff_sign_in",
      ip_address: req.ip,
    });

    res.status(200).json({
      token,
      expires_at,
      user: {
        id: staff.id,
        email: staff.email,
        role: staff.role,
        tenant_id: staff.tenant_id,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// POST /v1/auth/pin — 4-digit PIN for cashier terminal sign-in
// ---------------------------------------------------------------------------
authRouter.post(
  "/pin",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PinRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid request body", details: parsed.error.flatten() },
      });
      return;
    }

    const { tenant_id, location_id, pin } = parsed.data;

    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({
        error: { code: "service_unavailable", message: "Database not configured" },
      });
      return;
    }

    // Fetch all cashiers for this tenant+location
    const { data: candidates, error: queryError } = await client
      .from("staff_members")
      .select("id, tenant_id, full_name, pin_hash, location_ids")
      .eq("tenant_id", tenant_id)
      .eq("role", "cashier");

    if (queryError) {
      logger.error({ err: queryError }, "pin sign-in DB query failed");
      res.status(500).json({ error: { code: "internal_error", message: "Authentication failed" } });
      return;
    }

    // Filter to those assigned to this location
    const locationCandidates = (candidates ?? []).filter((s) =>
      Array.isArray(s.location_ids) && (s.location_ids as string[]).includes(location_id)
    );

    // Constant-time: iterate all candidates even after first match
    let matchedStaff: typeof locationCandidates[0] | null = null;
    for (const candidate of locationCandidates) {
      const valid = candidate.pin_hash
        ? await verifyPin(pin, candidate.pin_hash as string)
        : false;
      if (valid && !matchedStaff) {
        matchedStaff = candidate;
      }
    }

    if (!matchedStaff) {
      void writeAuditLog({
        tenant_id,
        staff_id: null,
        action: "cashier_pin_sign_in_failed",
        ip_address: req.ip,
      });
      res.status(401).json({
        error: { code: "unauthorized", message: "Invalid PIN" },
      });
      return;
    }

    const { token, expires_at } = await signTerminalJwt({
      tenant_id,
      location_id,
      staff_id: matchedStaff.id as string,
    });

    void writeAuditLog({
      tenant_id,
      staff_id: matchedStaff.id as string,
      action: "cashier_pin_sign_in",
      ip_address: req.ip,
    });

    res.status(200).json({
      token,
      expires_at,
      staff: {
        id: matchedStaff.id,
        full_name: matchedStaff.full_name,
        role: "cashier",
        tenant_id,
        location_id,
      },
    });
  }
);
