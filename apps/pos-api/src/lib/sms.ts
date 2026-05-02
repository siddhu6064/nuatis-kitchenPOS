import { env } from "../env.js";
import { logger } from "./logger.js";

export interface SendSmsParams {
  to: string;
  body: string;
}

export interface SendSmsResult {
  id: string;
}

/**
 * Send an SMS via the Telnyx Messages API.
 *
 * Mock mode: when TELNYX_API_KEY is absent, logs to stdout and returns a
 * fake message id so the receipt pipeline runs without a Telnyx account.
 *
 * Telnyx API docs: https://developers.telnyx.com/api/messaging/send-a-message
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  if (!env.TELNYX_API_KEY) {
    logger.info({ to: params.to, body: params.body }, "[mock sms] would send SMS");
    return { id: `mock-sms-${Date.now()}` };
  }

  const from = env.TELNYX_FROM_NUMBER;
  if (!from) {
    throw new Error(
      "TELNYX_FROM_NUMBER is required when TELNYX_API_KEY is set"
    );
  }

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TELNYX_API_KEY}`,
    },
    body: JSON.stringify({ from, to: params.to, text: params.body }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telnyx HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { data?: { id?: string } };
  return { id: json.data?.id ?? `telnyx-${Date.now()}` };
}
