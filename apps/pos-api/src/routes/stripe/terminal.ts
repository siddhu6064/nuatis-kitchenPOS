import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { getStripe, createConnectionToken, listTerminalReaders } from "../../lib/stripe.js";

export const terminalRouter: IRouter = Router();

const STRIPE_MOCK_503 = {
  error: {
    code: "stripe_not_configured",
    message: "STRIPE_SECRET_KEY is not set — Stripe integration is in mock mode",
  },
};

// ---------------------------------------------------------------------------
// POST /v1/stripe/terminal/connection-token
// Any authenticated caller (session or terminal) can request a token
// scoped to their tenant's Stripe connected account.
// ---------------------------------------------------------------------------
terminalRouter.post(
  "/connection-token",
  requireAuth(),
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
      .maybeSingle();

    const stripeAccountId = tenant?.stripe_account_id as string | null;

    try {
      const token = await createConnectionToken(stripeAccountId);
      res.json({ secret: token.secret });
    } catch (err: unknown) {
      res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/stripe/terminal/readers — list registered readers
// ---------------------------------------------------------------------------
terminalRouter.get(
  "/readers",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
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
      .maybeSingle();

    const stripeAccountId = tenant?.stripe_account_id as string | null;

    try {
      const readers = await listTerminalReaders(stripeAccountId);
      res.json(readers);
    } catch (err: unknown) {
      res.status(502).json({ error: { code: "stripe_error", message: (err as Error).message } });
    }
  }
);
