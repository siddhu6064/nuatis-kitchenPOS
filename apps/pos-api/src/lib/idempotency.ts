import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

/**
 * Check audit_log for a prior stripe webhook entry with the given event ID.
 * Uses target_id = Stripe event ID, action = 'stripe_webhook'.
 * Service role bypasses RLS — cross-tenant query is intentional.
 */
export async function hasProcessedStripeEvent(
  client: SupabaseClient,
  eventId: string
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;
    const { data, error } = await db
      .from("audit_log")
      .select("id")
      .eq("action", "stripe_webhook")
      .eq("target_id", eventId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn({ err: error, eventId }, "idempotency check failed — assuming not processed");
      return false;
    }
    return data !== null;
  } catch (err) {
    logger.warn({ err, eventId }, "idempotency check threw — assuming not processed");
    return false;
  }
}

/**
 * Write an audit_log entry marking the Stripe event as processed.
 * Fire-and-forget (non-fatal if it fails).
 */
export function markStripeEventProcessed(
  client: SupabaseClient,
  eventId: string,
  eventType: string,
  tenantId: string,
  payload: unknown
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (client as any)
    .from("audit_log")
    .insert({
      tenant_id: tenantId,
      staff_id: null,
      action: "stripe_webhook",
      target_type: "stripe_event",
      target_id: eventId,
      payload: { event_type: eventType, data: payload },
    })
    .then(({ error }: { error: unknown }) => {
      if (error) logger.warn({ err: error, eventId }, "failed to mark stripe event processed");
    });
}
