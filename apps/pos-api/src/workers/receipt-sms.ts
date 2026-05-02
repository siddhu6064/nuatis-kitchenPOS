import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { getRedisConnection, type ReceiptSmsJobData } from "../lib/queue.js";
import { sendSms } from "../lib/sms.js";
import { getSupabaseClient } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Processor — exported for unit-testability
// ---------------------------------------------------------------------------

export async function processReceiptSms(data: ReceiptSmsJobData): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn(
      { order_id: data.order_id },
      "receipt-sms worker: Supabase not configured — skipping"
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch tenant for display name
  const { data: tenant } = await db
    .from("tenants")
    .select("name")
    .eq("id", data.tenant_id)
    .single();

  const tenantName = (tenant as { name: string } | null)?.name ?? "the store";
  const smsBody = `Thanks for your visit to ${tenantName}! Your receipt: ${data.receipt_url}\nReply STOP to opt out.`;

  // TCPA double-check — re-fetch the contact to verify opt-in is still active.
  // This guards against a customer revoking consent between the API call and
  // the worker processing the job.
  const { data: contact } = await db
    .from("contacts")
    .select("id, sms_opt_in")
    .eq("tenant_id", data.tenant_id)
    .eq("phone", data.to)
    .maybeSingle();

  // Insert sms_messages row BEFORE sending
  const { data: msg, error: msgErr } = await db
    .from("sms_messages")
    .insert({
      tenant_id: data.tenant_id,
      order_id: data.order_id,
      to_phone: data.to,
      body: smsBody,
      status: "queued",
    })
    .select("id")
    .single();

  if (msgErr) throw new Error(`insert sms_messages: ${msgErr.message}`);

  // Abort if opt-in has been revoked
  if (!contact?.sms_opt_in) {
    await db
      .from("sms_messages")
      .update({ status: "failed", error: "opt_in_revoked" })
      .eq("id", msg.id);
    logger.warn({ order_id: data.order_id, to: data.to }, "SMS not sent — opt_in revoked");
    return;
  }

  try {
    const result = await sendSms({ to: data.to, body: smsBody });
    await db
      .from("sms_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.id,
      })
      .eq("id", msg.id);
    logger.info({ order_id: data.order_id, to: data.to, msg_id: result.id }, "receipt SMS sent");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.from("sms_messages").update({ status: "failed", error: errMsg }).eq("id", msg.id);
    logger.error({ err, order_id: data.order_id }, "receipt SMS failed");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startReceiptSmsWorker(): Worker<ReceiptSmsJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<ReceiptSmsJobData>(
    "receipt-sms",
    (job: Job<ReceiptSmsJobData>) => processReceiptSms(job.data),
    { connection: conn, concurrency: 2 }
  );

  worker.on("completed", (job) => {
    logger.info({ job_id: job.id }, "receipt-sms job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ job_id: job?.id, err }, "receipt-sms job failed");
  });

  return worker;
}
