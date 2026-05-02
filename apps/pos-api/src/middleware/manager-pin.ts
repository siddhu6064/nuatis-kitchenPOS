import type { Request, Response, NextFunction } from "express";
import { getSupabaseClient } from "../lib/supabase.js";
import { verifyPin } from "../lib/passwords.js";

/**
 * Manager PIN override middleware factory.
 *
 * Client UX flow:
 *   1. Cashier (or any caller) attempts a manager-gated action.
 *   2. Server returns 403 { error: { code: "manager_pin_required" } }.
 *   3. Terminal displays a PIN entry modal — a manager physically enters
 *      their 4-digit PIN on the screen.
 *   4. Client retries the SAME request with { manager_pin: "XXXX" } merged
 *      into the request body.
 *   5. If PIN matches any owner/manager staff member for the tenant:
 *        → request proceeds; req.manager_id is set to the matched staff id.
 *   6. If PIN is wrong:
 *        → 403 { error: { code: "manager_pin_invalid" } }.
 *
 * Security notes:
 *   - All owner/manager PINs for the tenant are iterated even after a match
 *     is found, providing constant-ish time behaviour that resists timing attacks.
 *   - tenant_id is always taken from req.auth (set by requireAuth), never from body.
 *   - requireAuth must run BEFORE this middleware.
 */
export function requireManagerPin() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const manager_pin = body["manager_pin"];

    if (!manager_pin || typeof manager_pin !== "string") {
      res.status(403).json({
        error: {
          code: "manager_pin_required",
          message: "A manager PIN is required for this action.",
        },
      });
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({
        error: { code: "service_unavailable", message: "DB not configured" },
      });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: staff, error } = await db
      .from("staff_members")
      .select("id, pin_hash")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "manager"]);

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    const staffList = (staff ?? []) as { id: string; pin_hash: string | null }[];
    let matchedManagerId: string | null = null;

    // Iterate ALL manager-level staff even after finding a match to avoid
    // leaking timing information about which staff member matched.
    for (const member of staffList) {
      if (!member.pin_hash) continue;
      const ok = await verifyPin(manager_pin, member.pin_hash);
      if (ok && !matchedManagerId) {
        matchedManagerId = member.id;
      }
    }

    if (!matchedManagerId) {
      res.status(403).json({
        error: {
          code: "manager_pin_invalid",
          message: "The manager PIN you entered is incorrect.",
        },
      });
      return;
    }

    req.manager_id = matchedManagerId;
    next();
  };
}
