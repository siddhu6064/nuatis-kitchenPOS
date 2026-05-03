/**
 * End-of-day rollup worker.
 *
 * Handles two job types on the "end-of-day-rollup" queue:
 *
 *   cron-check  — runs every 5 min; for each tenant whose local clock is
 *                 between 00:01–00:06, enqueues a "rollup" job for yesterday.
 *
 *   rollup      — fetches all orders for a tenant on a given date, runs
 *                 aggregateEndOfDay, and upserts a reports_daily row.
 *                 Optionally emails the owner when email_daily_report=true.
 */

import { Worker, type Job } from "bullmq";
import { getRedisConnection, getEodRollupQueue, type EodRollupJobData } from "../lib/queue.js";
import { aggregateEndOfDay, type PaymentRow, type OrderDiscountRow } from "../lib/reports.js";
import { getSupabaseClient } from "../lib/supabase.js";
import { sendReceiptEmail, type SendEmailParams } from "../lib/email.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RollupEmailFn = (params: SendEmailParams) => Promise<{ id: string }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Returns YYYY-MM-DD for yesterday in the given timezone. */
function yesterdayInTz(tz: string): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(yesterday);
}

/** Returns the current HH:MM (24h) in the given timezone. */
function currentTimeInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Returns a UTC ISO string offset by `hours` from noon of `dateStr`. */
function shiftDate(dateStr: string, hours: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Date(d.getTime() + hours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// Daily report email renderer
// ---------------------------------------------------------------------------

function renderDailyReportHtml(params: {
  tenant: { name: string };
  date: string;
  grossSalesCents: number;
  tipsCents: number;
  taxCents: number;
  netCents: number;
  orderCount: number;
  paidOrderCount: number;
  byMethod: Array<{ method: PaymentRow["method"]; count: number; gross_cents: number }>;
}): string {
  const { tenant, date, grossSalesCents, tipsCents, taxCents, netCents, orderCount, paidOrderCount, byMethod } = params;

  const methodRows = byMethod
    .map(
      (m) =>
        `<tr>
          <td style="padding:4px 0;color:#374151;">${m.method.replace(/_/g, " ")}</td>
          <td style="padding:4px 0;color:#374151;text-align:center;">${m.count}</td>
          <td style="padding:4px 0;color:#374151;text-align:right;">$${centsToStr(m.gross_cents)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Summary — ${tenant.name}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
  <div style="background:#0047FF;padding:24px 32px;">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${tenant.name}</h1>
    <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Daily Summary — ${date}</p>
  </div>
  <div style="padding:24px 32px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tbody>
        <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Gross Sales</td><td style="padding:5px 0;color:#111827;font-weight:600;text-align:right;">$${centsToStr(grossSalesCents)}</td></tr>
        <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Tips</td><td style="padding:5px 0;color:#111827;text-align:right;">$${centsToStr(tipsCents)}</td></tr>
        <tr><td style="padding:5px 0;color:#6B7280;font-size:13px;">Tax</td><td style="padding:5px 0;color:#111827;text-align:right;">$${centsToStr(taxCents)}</td></tr>
        <tr><td style="padding:5px 0;color:#111827;font-weight:700;border-top:1px solid #e5e7eb;padding-top:8px;">Net</td><td style="padding:5px 0;color:#111827;font-weight:700;text-align:right;border-top:1px solid #e5e7eb;padding-top:8px;">$${centsToStr(netCents)}</td></tr>
      </tbody>
    </table>
    <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">${paidOrderCount} paid order${paidOrderCount !== 1 ? "s" : ""} / ${orderCount} total</p>
    ${
      byMethod.length > 0
        ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead><tr>
          <th style="text-align:left;font-size:12px;color:#9CA3AF;padding-bottom:4px;">Method</th>
          <th style="text-align:center;font-size:12px;color:#9CA3AF;padding-bottom:4px;">Count</th>
          <th style="text-align:right;font-size:12px;color:#9CA3AF;padding-bottom:4px;">Gross</th>
        </tr></thead>
        <tbody>${methodRows}</tbody>
      </table>`
        : ""
    }
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
      Sign in at your Nuatis POS dashboard to view the full report and CSV export.
      <!-- TODO(Batch C): replace with direct link once admin app is online -->
    </p>
  </div>
</div>
</body></html>`;
}

function renderDailyReportText(params: {
  tenant: { name: string };
  date: string;
  grossSalesCents: number;
  netCents: number;
  paidOrderCount: number;
}): string {
  const { tenant, date, grossSalesCents, netCents, paidOrderCount } = params;
  return [
    `Daily Summary — ${tenant.name} — ${date}`,
    "",
    `Gross Sales: $${centsToStr(grossSalesCents)}`,
    `Net:         $${centsToStr(netCents)}`,
    `Paid Orders: ${paidOrderCount}`,
    "",
    "Sign in to your Nuatis POS dashboard for the full report.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Cron-check handler: find tenants in the 00:01–00:06 window and enqueue rollup
// ---------------------------------------------------------------------------

async function handleCronCheck(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn("[worker:end-of-day-rollup] cron-check: Supabase not configured — skipping");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: tenants, error } = await db
    .from("tenants")
    .select("id, timezone");

  if (error) {
    logger.error({ err: error }, "[worker:end-of-day-rollup] cron-check: failed to fetch tenants");
    return;
  }

  const queue = getEodRollupQueue();
  if (!queue) return;

  let enqueued = 0;
  for (const tenant of tenants ?? []) {
    const tz = (tenant.timezone as string | null) ?? "America/Chicago";
    const localTime = currentTimeInTz(tz);

    // Fire if local time is 00:01–00:06 (cron runs every 5 min)
    if (localTime >= "00:01" && localTime <= "00:06") {
      const date = yesterdayInTz(tz);
      const jobId = `rollup:${tenant.id as string}:${date}`;

      await queue.add(
        "rollup",
        { type: "rollup", tenant_id: tenant.id as string, date },
        { jobId, attempts: 3, backoff: { type: "exponential", delay: 60_000 } }
      );

      logger.info(
        { tenant_id: tenant.id, date, local_time: localTime },
        "[worker:end-of-day-rollup] enqueued rollup job"
      );
      enqueued++;
    }
  }

  if (enqueued === 0) {
    logger.debug("[worker:end-of-day-rollup] cron-check: no tenants in rollup window");
  }
}

// ---------------------------------------------------------------------------
// Rollup handler: compute snapshot and upsert to reports_daily
// ---------------------------------------------------------------------------

export async function processRollup(
  data: { tenant_id: string; date: string },
  overrides: { emailFn?: RollupEmailFn } = {}
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn(
      { tenant_id: data.tenant_id, date: data.date },
      "[worker:end-of-day-rollup] Supabase not configured — skipping rollup"
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { tenant_id, date } = data;

  logger.info({ tenant_id, date }, "[worker:end-of-day-rollup] starting rollup");

  // Fetch tenant
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("id, name, timezone, email_daily_report, daily_report_recipient_email")
    .eq("id", tenant_id)
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`[worker:end-of-day-rollup] tenant not found: ${tenant_id}`);
  }

  const timezone: string = (tenant.timezone as string | null) ?? "America/Chicago";

  // Fetch orders in ±36-hour UTC window around the target date
  const queryStart = shiftDate(date, -36);
  const queryEnd = shiftDate(date, 36);

  logger.info({ tenant_id, date, queryStart, queryEnd }, "[worker:end-of-day-rollup] fetching orders");

  const { data: orders, error: ordersErr } = await db
    .from("orders")
    .select("id, status, subtotal_cents, tax_cents, tip_cents, opened_by_staff_id, created_at, voided_at, closed_at")
    .eq("tenant_id", tenant_id)
    .gte("created_at", queryStart)
    .lte("created_at", queryEnd);

  if (ordersErr) throw new Error(`fetch orders: ${ordersErr.message}`);

  const orderIds = (orders ?? []).map((o: { id: string }) => o.id);

  let orderItems: unknown[] = [];
  let payments: PaymentRow[] = [];
  let staffMembers: unknown[] = [];
  let menuItems: unknown[] = [];
  let discounts: OrderDiscountRow[] = [];
  let refunds: Array<{ id: string; order_id: string; amount_cents: number; created_at: string }> = [];

  if (orderIds.length > 0) {
    logger.info({ tenant_id, date, order_count: orderIds.length }, "[worker:end-of-day-rollup] fetching line items and payments");

    const [oi, pay, staff, menu, disc] = await Promise.all([
      db.from("order_items").select("id, order_id, menu_item_id, name_snapshot, qty, price_cents, status").in("order_id", orderIds),
      db.from("payments").select("id, order_id, method, amount_cents, tip_cents, status, created_at").in("order_id", orderIds),
      db.from("staff_members").select("id, full_name").eq("tenant_id", tenant_id),
      db.from("menu_items").select("id, taxable").eq("tenant_id", tenant_id),
      db.from("order_discounts").select("id, order_id, applied_amount_cents, voided_at").in("order_id", orderIds),
    ]);

    orderItems = oi.data ?? [];
    payments = pay.data ?? [];
    staffMembers = staff.data ?? [];
    menuItems = menu.data ?? [];
    discounts = (disc.data ?? []) as OrderDiscountRow[];

    const paymentIds = payments.map((p) => p.id);
    if (paymentIds.length > 0) {
      const { data: refundsRaw } = await db
        .from("refunds")
        .select("id, payment_id, amount_cents, created_at")
        .in("payment_id", paymentIds);

      const paymentToOrder = new Map(payments.map((p) => [p.id, p.order_id]));
      refunds = ((refundsRaw ?? []) as Array<{
        id: string; payment_id: string; amount_cents: number; created_at: string
      }>)
        .filter((r) => paymentToOrder.has(r.payment_id))
        .map((r) => ({
          id: r.id,
          order_id: paymentToOrder.get(r.payment_id)!,
          amount_cents: r.amount_cents,
          created_at: r.created_at,
        }));
    }
  }

  const agg = aggregateEndOfDay({
    date,
    timezone,
    orders: orders ?? [],
    orderItems: orderItems as Parameters<typeof aggregateEndOfDay>[0]["orderItems"],
    payments,
    refunds,
    cashEvents: [],
    staffMembers: staffMembers as Parameters<typeof aggregateEndOfDay>[0]["staffMembers"],
    menuItems: menuItems as Parameters<typeof aggregateEndOfDay>[0]["menuItems"],
    discounts,
    salesTaxBps: 825,
  });

  logger.info({ tenant_id, date, gross_sales_cents: agg.gross_sales_cents }, "[worker:end-of-day-rollup] aggregation complete — upserting snapshot");

  // Upsert: select first, then insert or update (handles nullable location_id correctly)
  const { data: existing } = await db
    .from("reports_daily")
    .select("id")
    .eq("tenant_id", tenant_id)
    .is("location_id", null)
    .eq("date", date)
    .maybeSingle();

  const snapshotPayload = {
    tenant_id,
    location_id: null,
    date,
    is_final: true,
    snapshot_at: new Date().toISOString(),
    gross_sales_cents: agg.gross_sales_cents,
    taxable_cents: agg.taxable_cents,
    tax_cents: agg.tax_cents,
    tips_cents: agg.tips_cents,
    discounts_cents: agg.discounts_cents,
    voids_cents: agg.voids_cents,
    refunds_cents: agg.refunds_cents,
    net_cents: agg.net_cents,
    order_count: agg.order_count,
    paid_order_count: agg.paid_order_count,
    voided_order_count: agg.voided_order_count,
    by_method: JSON.stringify(agg.by_method),
    by_item: JSON.stringify(agg.by_item),
    by_staff: JSON.stringify(agg.by_staff),
  };

  if (existing) {
    await db.from("reports_daily").update(snapshotPayload).eq("id", existing.id);
    logger.info({ tenant_id, date, id: existing.id }, "[worker:end-of-day-rollup] updated existing snapshot");
  } else {
    const { error: insertErr } = await db.from("reports_daily").insert(snapshotPayload);
    if (insertErr) throw new Error(`insert reports_daily: ${insertErr.message}`);
    logger.info({ tenant_id, date }, "[worker:end-of-day-rollup] inserted new snapshot");
  }

  // Optional: send daily report email to owner
  const emailDailyReport = tenant.email_daily_report as boolean;
  if (!emailDailyReport) {
    logger.debug({ tenant_id, date }, "[worker:end-of-day-rollup] email_daily_report=false — skipping email");
    return;
  }

  // Resolve recipient
  let recipientEmail: string | null = (tenant.daily_report_recipient_email as string | null) ?? null;

  if (!recipientEmail) {
    // Fall back to owner staff_member email
    const { data: owner } = await db
      .from("staff_members")
      .select("email")
      .eq("tenant_id", tenant_id)
      .eq("role", "owner")
      .maybeSingle();

    recipientEmail = (owner?.email as string | null) ?? null;
  }

  if (!recipientEmail) {
    logger.warn({ tenant_id, date }, "[worker:end-of-day-rollup] no recipient email resolvable — skipping daily report email");
    return;
  }

  const subject = `Your daily summary: ${tenant.name as string} ${date}`;
  const html = renderDailyReportHtml({
    tenant: tenant as { name: string },
    date,
    grossSalesCents: agg.gross_sales_cents,
    tipsCents: agg.tips_cents,
    taxCents: agg.tax_cents,
    netCents: agg.net_cents,
    orderCount: agg.order_count,
    paidOrderCount: agg.paid_order_count,
    byMethod: agg.by_method,
  });
  const text = renderDailyReportText({
    tenant: tenant as { name: string },
    date,
    grossSalesCents: agg.gross_sales_cents,
    netCents: agg.net_cents,
    paidOrderCount: agg.paid_order_count,
  });

  const emailFn = overrides.emailFn ?? sendReceiptEmail;

  try {
    const result = await emailFn({ to: recipientEmail, subject, html, text });
    logger.info({ tenant_id, date, email_id: result.id, to: recipientEmail }, "[worker:end-of-day-rollup] daily report email sent");
  } catch (err) {
    // Don't throw — email failure shouldn't prevent the snapshot from being saved
    logger.error({ err, tenant_id, date, to: recipientEmail }, "[worker:end-of-day-rollup] daily report email failed (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startEodRollupWorker(): Worker<EodRollupJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<EodRollupJobData>(
    "end-of-day-rollup",
    async (job: Job<EodRollupJobData>) => {
      if (job.data.type === "cron-check") {
        await handleCronCheck();
      } else if (job.data.type === "rollup") {
        await processRollup({ tenant_id: job.data.tenant_id!, date: job.data.date! });
      }
    },
    { connection: conn, concurrency: 2 }
  );

  worker.on("completed", (job) => {
    logger.info({ job_id: job.id, job_name: job.name }, "[worker:end-of-day-rollup] job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ job_id: job?.id, job_name: job?.name, err }, "[worker:end-of-day-rollup] job failed");
  });

  return worker;
}
