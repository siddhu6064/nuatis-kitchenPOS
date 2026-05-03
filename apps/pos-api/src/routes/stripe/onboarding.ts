import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import {
  getStripe,
  createConnectAccount,
  createAccountLink,
  retrieveAccount,
} from "../../lib/stripe.js";
import { writeAuditLog } from "../../lib/db.js";

export const onboardingRouter: IRouter = Router();

const STRIPE_MOCK_503 = {
  error: {
    code: "stripe_not_configured",
    message: "STRIPE_SECRET_KEY is not set — Stripe integration is in mock mode",
  },
};

// ---------------------------------------------------------------------------
// POST /v1/stripe/onboarding/start — create Connect account + return link URL
// ---------------------------------------------------------------------------
onboardingRouter.post(
  "/start",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner"]),
  async (req: Request, res: Response): Promise<void> => {
    if (!getStripe()) { res.status(503).json(STRIPE_MOCK_503); return; }

    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const tenantId = req.auth!.tenant_id;
    const callerId = req.auth!.kind === "session" ? req.auth!.user_id : req.auth!.staff_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Fetch tenant for name + email
    const { data: tenant, error: tenantErr } = await db
      .from("tenants")
      .select("id, name, stripe_account_id, stripe_charges_enabled")
      .eq("id", tenantId)
      .single();

    if (tenantErr) { res.status(500).json({ error: { code: "internal_error", message: tenantErr.message } }); return; }

    let stripeAccountId = tenant.stripe_account_id as string | null;

    // Create account if not yet created
    if (!stripeAccountId) {
      try {
        const account = await createConnectAccount(tenant.name as string, "US", null);
        stripeAccountId = account.id;

        await db.from("tenants").update({ stripe_account_id: stripeAccountId }).eq("id", tenantId);

        writeAuditLog(client, {
          tenant_id: tenantId,
          staff_id: callerId,
          action: "stripe_account_created",
          target_type: "tenant",
          target_id: tenantId,
          payload: { stripe_account_id: stripeAccountId },
          ip_address: req.ip,
        });
      } catch (err: unknown) {
        res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
        return;
      }
    }

    // Create account link
    try {
      const link = await createAccountLink(stripeAccountId);
      res.json({ url: link.url, expires_at: new Date(link.expires_at * 1000).toISOString() });
    } catch (err: unknown) {
      res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/stripe/onboarding/status — live status from Stripe
// ---------------------------------------------------------------------------
onboardingRouter.get(
  "/status",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: tenant, error: tenantErr } = await db
      .from("tenants")
      .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_requirements_currently_due")
      .eq("id", tenantId)
      .single();

    if (tenantErr) { res.status(500).json({ error: { code: "internal_error", message: tenantErr.message } }); return; }

    const stripeAccountId = tenant.stripe_account_id as string | null;

    // No account yet — not started
    if (!stripeAccountId) {
      res.json({
        stripe_account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_currently_due: [],
      });
      return;
    }

    // Live fetch from Stripe if configured
    if (getStripe()) {
      try {
        const account = await retrieveAccount(stripeAccountId);

        const status = {
          stripe_account_id: stripeAccountId,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements_currently_due: account.requirements?.currently_due ?? [],
        };

        // Sync to DB (non-blocking)
        void db.from("tenants").update({
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
          stripe_requirements_currently_due: account.requirements?.currently_due ?? [],
        }).eq("id", tenantId);

        res.json(status);
        return;
      } catch {
        // Fall through to cached DB values on Stripe error
      }
    }

    // Mock mode or Stripe error — return cached DB state
    res.json({
      stripe_account_id: stripeAccountId,
      charges_enabled: tenant.stripe_charges_enabled as boolean,
      payouts_enabled: tenant.stripe_payouts_enabled as boolean,
      requirements_currently_due: (tenant.stripe_requirements_currently_due as string[]) ?? [],
    });
  }
);

// ---------------------------------------------------------------------------
// GET /v1/stripe/onboarding/refresh — generate a new onboarding link
// ---------------------------------------------------------------------------
onboardingRouter.get(
  "/refresh",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner"]),
  async (req: Request, res: Response): Promise<void> => {
    if (!getStripe()) { res.status(503).json(STRIPE_MOCK_503); return; }

    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: tenant } = await db
      .from("tenants")
      .select("stripe_account_id")
      .eq("id", tenantId)
      .single();

    const stripeAccountId = tenant?.stripe_account_id as string | null;
    if (!stripeAccountId) {
      res.status(400).json({ error: { code: "no_stripe_account", message: "No Stripe account found — call /start first" } });
      return;
    }

    try {
      const link = await createAccountLink(stripeAccountId);
      res.json({ url: link.url, expires_at: new Date(link.expires_at * 1000).toISOString() });
    } catch (err: unknown) {
      res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
    }
  }
);
