import express, { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { getStripe } from "../../lib/stripe.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { hasProcessedStripeEvent, markStripeEventProcessed } from "../../lib/idempotency.js";
import { writeAuditLog } from "../../lib/db.js";
import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";

export const webhookRouter: IRouter = Router();

// IMPORTANT: This route uses express.raw() so the body is available as a Buffer
// for Stripe signature verification. It MUST be mounted BEFORE express.json()
// in index.ts.
webhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response): Promise<void> => {
    const stripe = getStripe();
    const sigHeader = req.headers["stripe-signature"];

    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      // Mock mode — log and return 200 (webhook delivery should not fail permanently)
      logger.warn("stripe webhook received but Stripe not configured — ignoring");
      res.status(200).send();
      return;
    }

    if (!sigHeader || typeof sigHeader !== "string") {
      res.status(400).send();
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sigHeader,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: unknown) {
      logger.warn({ err }, "stripe webhook signature verification failed");
      // Return 400 with empty body — never echo error details to Stripe
      res.status(400).send();
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      // DB not configured — return 200 to avoid Stripe retrying indefinitely
      logger.warn("stripe webhook received but DB not configured");
      res.status(200).send();
      return;
    }

    // Idempotency — skip if already processed
    const alreadyProcessed = await hasProcessedStripeEvent(client, event.id);
    if (alreadyProcessed) {
      logger.info({ eventId: event.id, type: event.type }, "stripe webhook already processed — skipping");
      res.status(200).send();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    try {
      switch (event.type) {
        case "account.updated": {
          await handleAccountUpdated(db, client, event);
          break;
        }
        case "payment_intent.succeeded": {
          await handlePaymentIntentSucceeded(stripe, db, client, event);
          break;
        }
        case "payment_intent.payment_failed": {
          await handlePaymentIntentFailed(db, client, event);
          break;
        }
        case "charge.refunded": {
          await handleChargeRefunded(db, client, event);
          break;
        }
        default:
          logger.debug({ type: event.type }, "stripe webhook: unhandled event type");
      }
    } catch (err: unknown) {
      logger.error({ err, eventId: event.id, type: event.type }, "stripe webhook handler error");
      // Still return 200 — we've already verified the signature, the error is ours
    }

    // Always return 200
    res.status(200).send();
  }
);

// ---------------------------------------------------------------------------
// account.updated — sync Connect account status to tenants table
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAccountUpdated(db: any, client: ReturnType<typeof getSupabaseClient>, event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const stripeAccountId = account.id;

  const { data: tenant } = await db
    .from("tenants")
    .select("id")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (!tenant) {
    logger.warn({ stripeAccountId }, "account.updated: no tenant found for stripe account");
    return;
  }

  const tenantId = tenant.id as string;
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const requirementsDue = account.requirements?.currently_due ?? [];

  await db.from("tenants").update({
    stripe_charges_enabled: chargesEnabled,
    stripe_payouts_enabled: payoutsEnabled,
    stripe_requirements_currently_due: requirementsDue,
  }).eq("id", tenantId);

  markStripeEventProcessed(client!, event.id, event.type, tenantId, {
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    requirements_due: requirementsDue,
  });

  writeAuditLog(client!, {
    tenant_id: tenantId,
    action: "stripe_account_updated",
    target_type: "tenant",
    target_id: tenantId,
    payload: { charges_enabled: chargesEnabled, payouts_enabled: payoutsEnabled, requirements_due: requirementsDue },
  });

  logger.info({ tenantId, stripeAccountId, chargesEnabled }, "account.updated synced");
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded — update payment + order to paid
// ---------------------------------------------------------------------------
async function handlePaymentIntentSucceeded(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  client: ReturnType<typeof getSupabaseClient>,
  event: Stripe.Event
): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const piId = paymentIntent.id;

  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, tenant_id, tip_cents")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  if (!payment) {
    logger.warn({ piId }, "payment_intent.succeeded: no payment row found");
    return;
  }

  const paymentId = payment.id as string;
  const orderId = payment.order_id as string;
  const tenantId = payment.tenant_id as string;
  const tipCents = payment.tip_cents as number;
  const now = new Date().toISOString();

  // Retrieve charge for card details
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let stripeChargeId: string | null = null;

  const chargeId = typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : (paymentIntent.latest_charge as Stripe.Charge | null)?.id ?? null;

  if (chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      stripeChargeId = charge.id;
      const cpDetails = charge.payment_method_details?.card_present;
      cardBrand = cpDetails?.brand ?? charge.payment_method_details?.card?.brand ?? null;
      cardLast4 = cpDetails?.last4 ?? charge.payment_method_details?.card?.last4 ?? null;
    } catch (err) {
      logger.warn({ err, chargeId }, "failed to retrieve charge for card details");
    }
  }

  await db.from("payments").update({
    status: "succeeded",
    stripe_charge_id: stripeChargeId,
    card_brand: cardBrand,
    card_last4: cardLast4,
    updated_at: now,
  }).eq("id", paymentId);

  await db.from("orders").update({
    status: "paid",
    tip_cents: tipCents,
    closed_at: now,
    updated_at: now,
  }).eq("id", orderId).eq("tenant_id", tenantId);

  // Broadcast on payment:{order_id} channel for terminal real-time update
  if (client) {
    void (client as ReturnType<typeof getSupabaseClient>)!
      .channel(`payment:${orderId}`)
      .send({
        type: "broadcast",
        event: "payment_succeeded",
        payload: { order_id: orderId, payment_id: paymentId },
      })
      .catch((err: unknown) => logger.warn({ err }, "realtime broadcast failed (non-fatal)"));
  }

  markStripeEventProcessed(client!, event.id, event.type, tenantId, { payment_id: paymentId, order_id: orderId });

  writeAuditLog(client!, {
    tenant_id: tenantId,
    action: "payment_stripe_succeeded",
    target_type: "payment",
    target_id: paymentId,
    payload: { order_id: orderId, pi_id: piId, card_brand: cardBrand, card_last4: cardLast4 },
  });

  logger.info({ paymentId, orderId, tenantId }, "payment_intent.succeeded: order marked paid");
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed — mark payment as failed
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentIntentFailed(db: any, client: ReturnType<typeof getSupabaseClient>, event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const piId = paymentIntent.id;
  const errMessage = paymentIntent.last_payment_error?.message ?? "Payment failed";

  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, tenant_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  if (!payment) {
    logger.warn({ piId }, "payment_intent.payment_failed: no payment row found");
    return;
  }

  const paymentId = payment.id as string;
  const orderId = payment.order_id as string;
  const tenantId = payment.tenant_id as string;

  await db.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", paymentId);

  // Broadcast failure
  if (client) {
    void (client as ReturnType<typeof getSupabaseClient>)!
      .channel(`payment:${orderId}`)
      .send({
        type: "broadcast",
        event: "payment_failed",
        payload: { order_id: orderId, payment_id: paymentId, error: errMessage },
      })
      .catch((err: unknown) => logger.warn({ err }, "realtime broadcast failed (non-fatal)"));
  }

  markStripeEventProcessed(client!, event.id, event.type, tenantId, { payment_id: paymentId, error: errMessage });

  logger.info({ paymentId, piId }, "payment_intent.payment_failed: payment marked failed");
}

// ---------------------------------------------------------------------------
// charge.refunded — upsert refund row
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleChargeRefunded(db: any, client: ReturnType<typeof getSupabaseClient>, event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const chargeId = charge.id;

  const { data: payment } = await db
    .from("payments")
    .select("id, tenant_id")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();

  if (!payment) {
    logger.warn({ chargeId }, "charge.refunded: no payment row found for charge");
    return;
  }

  const paymentId = payment.id as string;
  const tenantId = payment.tenant_id as string;

  // Process each refund on the charge (may be partial)
  for (const refund of (charge.refunds?.data ?? []) as Stripe.Refund[]) {
    const existing = await db
      .from("refunds")
      .select("id")
      .eq("stripe_refund_id", refund.id)
      .maybeSingle();

    if (existing.data) continue; // already recorded

    await db.from("refunds").insert({
      payment_id: paymentId,
      stripe_refund_id: refund.id,
      amount_cents: refund.amount,
      reason: refund.reason ?? "webhook",
      application_fee_refund_cents: 0, // set by refund endpoint if available
    });
  }

  markStripeEventProcessed(client!, event.id, event.type, tenantId, { charge_id: chargeId });

  writeAuditLog(client!, {
    tenant_id: tenantId,
    action: "stripe_charge_refunded",
    target_type: "payment",
    target_id: paymentId,
    payload: { charge_id: chargeId, refund_count: (charge.refunds?.data ?? []).length },
  });

  logger.info({ paymentId, chargeId }, "charge.refunded: refund rows upserted");
}
