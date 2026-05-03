import Stripe from "stripe";
import { env } from "../env.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" as any });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Connect Standard onboarding helpers
// ---------------------------------------------------------------------------

export async function createConnectAccount(
  businessName: string,
  country: string,
  email?: string | null
): Promise<Stripe.Account> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  return stripe.accounts.create({
    type: "standard",
    country,
    business_profile: { name: businessName },
    email: email ?? undefined,
  });
}

export async function createAccountLink(
  stripeAccountId: string
): Promise<Stripe.AccountLink> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  return stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: env.STRIPE_CONNECT_REFRESH_URL ?? "http://localhost:3001/settings",
    return_url: env.STRIPE_CONNECT_RETURN_URL ?? "http://localhost:3001/settings",
    type: "account_onboarding",
  });
}

export async function retrieveAccount(stripeAccountId: string): Promise<Stripe.Account> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  return stripe.accounts.retrieve(stripeAccountId);
}

// ---------------------------------------------------------------------------
// PaymentIntent (Connect Standard — charge on behalf of connected account)
// ---------------------------------------------------------------------------

export interface CreatePaymentIntentParams {
  amount: number;
  currency?: string;
  application_fee_amount?: number;
  on_behalf_of: string;
  transfer_data: { destination: string };
  metadata?: Record<string, string>;
  payment_method_types?: string[];
  capture_method?: Stripe.PaymentIntentCreateParams.CaptureMethod;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency ?? "usd",
    payment_method_types: params.payment_method_types ?? ["card_present"],
    capture_method: params.capture_method ?? "automatic",
    on_behalf_of: params.on_behalf_of,
    transfer_data: params.transfer_data,
    application_fee_amount: params.application_fee_amount,
    metadata: params.metadata,
  });
}

// ---------------------------------------------------------------------------
// Terminal — connection token
// ---------------------------------------------------------------------------

export async function createConnectionToken(
  stripeAccountId?: string | null
): Promise<Stripe.Terminal.ConnectionToken> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const options: Stripe.RequestOptions = stripeAccountId
    ? { stripeAccount: stripeAccountId }
    : {};

  return stripe.terminal.connectionTokens.create({}, options);
}

// ---------------------------------------------------------------------------
// Terminal — list readers
// ---------------------------------------------------------------------------

export async function listTerminalReaders(
  stripeAccountId?: string | null
): Promise<Stripe.Terminal.Reader[]> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const options: Stripe.RequestOptions = stripeAccountId
    ? { stripeAccount: stripeAccountId }
    : {};

  const result = await stripe.terminal.readers.list({}, options);
  return result.data;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function refundPaymentIntent(
  paymentIntentId: string,
  amountCents?: number,
  reverseTransfer = true,
  refundApplicationFee = true
): Promise<Stripe.Refund> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
    reverse_transfer: reverseTransfer,
    refund_application_fee: refundApplicationFee,
  });
}

// ---------------------------------------------------------------------------
// Boot-time log
// ---------------------------------------------------------------------------

if (!env.STRIPE_SECRET_KEY) {
  logger.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe routes in mock mode");
}
