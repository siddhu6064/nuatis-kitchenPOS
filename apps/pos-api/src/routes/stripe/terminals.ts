import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { getStripe } from "../../lib/stripe.js";
import { logger } from "../../lib/logger.js";

export const terminalsRouter: IRouter = Router();

const RegisterReaderSchema = z.object({
  stripe_reader_id: z.string().min(1).max(200),
  label: z.string().min(1).max(100),
  location_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// GET /v1/terminals — list registered readers (from DB)
// ---------------------------------------------------------------------------
terminalsRouter.get(
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
      .from("stripe_terminal_readers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: (error as Error).message } });
      return;
    }

    res.json(data ?? []);
  }
);

// ---------------------------------------------------------------------------
// POST /v1/terminals/register — register a new Stripe Terminal reader
//
// Body: { stripe_reader_id, label, label, location_id? }
//
// Real mode: validates the reader exists in the tenant's Stripe account.
// Mock mode (no STRIPE_SECRET_KEY): accepts blindly, sets last_seen_at = now.
// ---------------------------------------------------------------------------
terminalsRouter.post(
  "/register",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = RegisterReaderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } });
      return;
    }

    const { stripe_reader_id, label, location_id } = parsed.data;
    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Real mode: validate that the reader belongs to the tenant's Connect account
    const stripe = getStripe();
    if (stripe) {
      const { data: tenant } = await db
        .from("tenants")
        .select("stripe_account_id")
        .eq("id", tenantId)
        .maybeSingle();

      const stripeAccountId = tenant?.stripe_account_id as string | null;
      if (stripeAccountId) {
        try {
          await stripe.terminal.readers.retrieve(
            stripe_reader_id,
            {},
            { stripeAccount: stripeAccountId }
          );
        } catch (err) {
          logger.warn({ err, stripe_reader_id, stripeAccountId }, "reader not found in Stripe account");
          res.status(422).json({
            error: {
              code: "invalid_reader",
              message: "Reader not found in this Stripe account. Verify the reader ID and that it belongs to your connected account.",
            },
          });
          return;
        }
      }
    }

    const { data: reader, error } = await db
      .from("stripe_terminal_readers")
      .insert({
        tenant_id: tenantId,
        stripe_reader_id,
        label,
        location_id: location_id ?? null,
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      const pgError = error as { code?: string; message?: string };
      if (pgError.code === "23505") {
        res.status(409).json({ error: { code: "conflict", message: "This reader ID is already registered" } });
        return;
      }
      res.status(500).json({ error: { code: "internal_error", message: pgError.message ?? "DB error" } });
      return;
    }

    logger.info({ tenantId, stripe_reader_id, label }, "terminal reader registered");
    res.status(201).json(reader);
  }
);
