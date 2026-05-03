import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { getRedisConnection, type ReceiptEmailJobData } from "../lib/queue.js";
import { sendReceiptEmail } from "../lib/email.js";
import { getSupabaseClient } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// HTML / text renderers
// ---------------------------------------------------------------------------

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface DiscountLine {
  reason: string;
  applied_amount_cents: number;
}

export function renderReceiptHtml(params: {
  order: Record<string, unknown>;
  items: Array<{ name_snapshot: string; qty: number; price_cents: number }>;
  discounts: DiscountLine[];
  tenant: { name: string };
  location: { name: string; address?: unknown } | null;
  payment: { method: string } | null;
  receipt_url: string;
}): string {
  const { order, items, discounts, tenant, location, payment, receipt_url } = params;
  const orderNum = (order["order_number"] as number | null) ?? (order["id"] as string).slice(0, 8);
  const subtotal = order["subtotal_cents"] as number;
  const tax = order["tax_cents"] as number;
  const tip = order["tip_cents"] as number;
  const total = order["total_cents"] as number;
  const date = new Date((order["closed_at"] as string) ?? (order["opened_at"] as string)).toLocaleString();

  const itemRows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:4px 0;color:#374151;">${i.name_snapshot}</td>
          <td style="padding:4px 0;color:#6B7280;text-align:center;">×${i.qty}</td>
          <td style="padding:4px 0;color:#374151;text-align:right;">$${centsToStr(i.price_cents * i.qty)}</td>
        </tr>`
    )
    .join("");

  const discountRows = discounts
    .map(
      (d) =>
        `<tr>
          <td style="padding:3px 0;color:#6B7280;font-size:13px;">Discount <span style="color:#9CA3AF;font-size:12px;">(${d.reason})</span></td>
          <td style="padding:3px 0;color:#DC2626;font-size:13px;text-align:right;">−$${centsToStr(d.applied_amount_cents)}</td>
        </tr>`
    )
    .join("");

  const addr =
    location?.address && typeof location.address === "object"
      ? Object.values(location.address as Record<string, string>).join(", ")
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt — ${tenant.name}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <div style="background:#0047FF;padding:24px 32px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${tenant.name}</h1>
    ${addr ? `<p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">${addr}</p>` : ""}
  </div>
  <div style="padding:24px 32px;">
    <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">Order #${orderNum}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#6B7280;">${date}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tbody>${itemRows}</tbody>
    </table>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 12px;">
    <table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="padding:3px 0;color:#6B7280;font-size:13px;">Subtotal</td>
          <td style="padding:3px 0;color:#374151;font-size:13px;text-align:right;">$${centsToStr(subtotal)}</td>
        </tr>
        ${discountRows}
        <tr>
          <td style="padding:3px 0;color:#6B7280;font-size:13px;">Tax</td>
          <td style="padding:3px 0;color:#374151;font-size:13px;text-align:right;">$${centsToStr(tax)}</td>
        </tr>
        ${
          tip > 0
            ? `<tr>
          <td style="padding:3px 0;color:#6B7280;font-size:13px;">Tip</td>
          <td style="padding:3px 0;color:#374151;font-size:13px;text-align:right;">$${centsToStr(tip)}</td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:8px 0 0;font-weight:700;color:#111827;">Total</td>
          <td style="padding:8px 0 0;font-weight:700;color:#111827;text-align:right;">$${centsToStr(total)}</td>
        </tr>
        ${
          payment?.method
            ? `<tr>
          <td style="padding:3px 0;color:#9CA3AF;font-size:12px;">Payment</td>
          <td style="padding:3px 0;color:#9CA3AF;font-size:12px;text-align:right;">${payment.method}</td>
        </tr>`
            : ""
        }
      </tbody>
    </table>
    <div style="margin-top:24px;text-align:center;">
      <a href="${receipt_url}" style="display:inline-block;background:#0047FF;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View receipt online</a>
    </div>
    <p style="margin:20px 0 0;font-size:11px;color:#9CA3AF;text-align:center;">Thank you for your visit!</p>
  </div>
</div>
</body></html>`;
}

export function renderReceiptText(params: {
  order: Record<string, unknown>;
  items: Array<{ name_snapshot: string; qty: number; price_cents: number }>;
  discounts: DiscountLine[];
  tenant: { name: string };
  receipt_url: string;
}): string {
  const { order, items, discounts, tenant, receipt_url } = params;
  const orderNum = (order["order_number"] as number | null) ?? (order["id"] as string).slice(0, 8);
  const subtotal = order["subtotal_cents"] as number;
  const tax = order["tax_cents"] as number;
  const tip = order["tip_cents"] as number;
  const total = order["total_cents"] as number;

  const discountLines = discounts.map(
    (d) => `Discount (${d.reason}): -$${centsToStr(d.applied_amount_cents)}`
  );

  const lines = [
    `Receipt from ${tenant.name}`,
    `Order #${orderNum}`,
    "",
    ...items.map((i) => `  ${i.name_snapshot} x${i.qty}  $${centsToStr(i.price_cents * i.qty)}`),
    "",
    `Subtotal: $${centsToStr(subtotal)}`,
    ...discountLines,
    `Tax: $${centsToStr(tax)}`,
    ...(tip > 0 ? [`Tip: $${centsToStr(tip)}`] : []),
    `Total: $${centsToStr(total)}`,
    "",
    `View online: ${receipt_url}`,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Processor — exported for unit-testability (no BullMQ needed in tests)
// ---------------------------------------------------------------------------

export async function processReceiptEmail(
  data: ReceiptEmailJobData
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn(
      { order_id: data.order_id },
      "receipt-email worker: Supabase not configured — skipping"
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("*")
    .eq("id", data.order_id)
    .single();
  if (orderErr) throw new Error(`fetch order: ${orderErr.message}`);

  // Fetch non-voided items, discounts, tenant, location, and payment in parallel
  const [itemsRes, discountsRes, tenantRes, locationRes, paymentRes] = await Promise.all([
    db
      .from("order_items")
      .select("name_snapshot, qty, price_cents")
      .eq("order_id", data.order_id)
      .neq("status", "voided"),
    db
      .from("order_discounts")
      .select("reason, applied_amount_cents")
      .eq("order_id", data.order_id)
      .is("voided_at", null),
    db
      .from("tenants")
      .select("name")
      .eq("id", data.tenant_id)
      .single(),
    db
      .from("locations")
      .select("name, address")
      .eq("id", order.location_id)
      .maybeSingle(),
    db
      .from("payments")
      .select("method")
      .eq("order_id", data.order_id)
      .eq("status", "succeeded")
      .maybeSingle(),
  ]);

  const items = (itemsRes.data ?? []) as Array<{ name_snapshot: string; qty: number; price_cents: number }>;
  const discounts = (discountsRes.data ?? []) as DiscountLine[];
  const tenant = tenantRes.data as { name: string };
  const location = locationRes.data as { name: string; address?: unknown } | null;
  const payment = paymentRes.data as { method: string } | null;

  if (tenantRes.error) throw new Error(`fetch tenant: ${tenantRes.error.message}`);

  // Insert email_messages row BEFORE sending (so we have a record even on failure)
  const subject = `Receipt from ${tenant.name} — Order #${(order["order_number"] as number | null) ?? (order["id"] as string).slice(0, 8)}`;

  const { data: msg, error: msgErr } = await db
    .from("email_messages")
    .insert({
      tenant_id: data.tenant_id,
      order_id: data.order_id,
      to_email: data.to,
      subject,
      status: "queued",
    })
    .select("id")
    .single();

  if (msgErr) throw new Error(`insert email_messages: ${msgErr.message}`);

  const html = renderReceiptHtml({
    order: order as Record<string, unknown>,
    items,
    discounts,
    tenant,
    location,
    payment,
    receipt_url: data.receipt_url,
  });

  const text = renderReceiptText({
    order: order as Record<string, unknown>,
    items,
    discounts,
    tenant,
    receipt_url: data.receipt_url,
  });

  try {
    const result = await sendReceiptEmail({ to: data.to, subject, html, text });
    await db
      .from("email_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.id,
      })
      .eq("id", msg.id);
    logger.info({ order_id: data.order_id, to: data.to, msg_id: result.id }, "receipt email sent");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.from("email_messages").update({ status: "failed", error: errMsg }).eq("id", msg.id);
    logger.error({ err, order_id: data.order_id }, "receipt email failed");
    throw err; // re-throw so BullMQ can retry
  }
}

// ---------------------------------------------------------------------------
// Worker factory — call at boot time when Redis is configured
// ---------------------------------------------------------------------------

export function startReceiptEmailWorker(): Worker<ReceiptEmailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<ReceiptEmailJobData>(
    "receipt-email",
    (job: Job<ReceiptEmailJobData>) => processReceiptEmail(job.data),
    { connection: conn, concurrency: 2 }
  );

  worker.on("completed", (job) => {
    logger.info({ job_id: job.id }, "receipt-email job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ job_id: job?.id, err }, "receipt-email job failed");
  });

  return worker;
}
