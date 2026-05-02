import { env } from "../env.js";
import { logger } from "./logger.js";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  id: string;
}

/**
 * Send a transactional email via Resend.
 *
 * Mock mode: when RESEND_API_KEY is absent, logs to stdout and returns a
 * fake message id. This allows the receipt pipeline to run end-to-end in
 * development without a Resend account.
 */
export async function sendReceiptEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    logger.info(
      { to: params.to, subject: params.subject },
      "[mock email] would send receipt email"
    );
    return { id: `mock-email-${Date.now()}` };
  }

  try {
    // Dynamic import keeps Resend out of the critical boot path when not configured.
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: "receipts@nuatis.app",
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
    }

    return { id: data?.id ?? `resend-${Date.now()}` };
  } catch (err) {
    logger.error({ err, to: params.to }, "sendReceiptEmail failed");
    throw err;
  }
}
