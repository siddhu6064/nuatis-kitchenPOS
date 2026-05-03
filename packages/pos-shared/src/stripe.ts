import { z } from "zod";

// ---------------------------------------------------------------------------
// Stripe Connect account status
// ---------------------------------------------------------------------------

export const StripeAccountStatusSchema = z.object({
  stripe_account_id: z.string().nullable(),
  charges_enabled: z.boolean(),
  payouts_enabled: z.boolean(),
  requirements_currently_due: z.array(z.string()),
});
export type StripeAccountStatus = z.infer<typeof StripeAccountStatusSchema>;

// ---------------------------------------------------------------------------
// Stripe onboarding link
// ---------------------------------------------------------------------------

export const CreateOnboardingLinkResponseSchema = z.object({
  url: z.string().url(),
  expires_at: z.string().datetime(),
});
export type CreateOnboardingLinkResponse = z.infer<typeof CreateOnboardingLinkResponseSchema>;

// ---------------------------------------------------------------------------
// Stripe Terminal connection token
// ---------------------------------------------------------------------------

export const CreateConnectionTokenResponseSchema = z.object({
  secret: z.string(),
});
export type CreateConnectionTokenResponse = z.infer<typeof CreateConnectionTokenResponseSchema>;

// ---------------------------------------------------------------------------
// Webhook event type narrowing helpers
// ---------------------------------------------------------------------------

export const STRIPE_HANDLED_EVENTS = [
  "account.updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
] as const;

export type StripeHandledEventType = (typeof STRIPE_HANDLED_EVENTS)[number];
