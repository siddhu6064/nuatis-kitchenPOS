import { Router, type IRouter, type Request, type Response } from "express";
import { GetEndOfDayQuerySchema, type EndOfDayReport } from "@nuatis/pos-shared";
import { stringify } from "csv-stringify/sync";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { aggregateEndOfDay } from "../../lib/reports.js";

export const csvRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Money helpers (cents → "$X.XX" for spreadsheet readability)
// ---------------------------------------------------------------------------

function toDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// CSV serializer
// ---------------------------------------------------------------------------

/**
 * Serialises an EndOfDayReport into multi-section CSV:
 *   1. Daily summary header rows
 *   2. (blank)
 *   3. By-item breakdown
 *   4. (blank)
 *   5. By-staff breakdown
 *   6. (blank)
 *   7. By-payment-method breakdown
 */
export function reportToCsv(report: EndOfDayReport): string {
  const rows: Array<string[]> = [];

  // ── Summary section ───────────────────────────────────────────────────────
  rows.push(["Summary"]);
  rows.push(["Date", report.date]);
  rows.push(["Is Snapshot", String(report.is_snapshot)]);
  rows.push(["Gross Sales", toDollars(report.gross_sales_cents)]);
  rows.push(["Tips", toDollars(report.tips_cents)]);
  rows.push(["Tax", toDollars(report.tax_cents)]);
  rows.push(["Taxable Sales", toDollars(report.taxable_cents)]);
  rows.push(["Discounts", toDollars(report.discounts_cents)]);
  rows.push(["Voids", toDollars(report.voids_cents)]);
  rows.push(["Refunds", toDollars(report.refunds_cents)]);
  rows.push(["Net", toDollars(report.net_cents)]);
  rows.push(["Total Orders", String(report.order_count)]);
  rows.push(["Paid Orders", String(report.paid_order_count)]);
  rows.push(["Voided Orders", String(report.voided_order_count)]);

  // ── By-item section ───────────────────────────────────────────────────────
  rows.push([]);
  rows.push(["By Item"]);
  rows.push(["Item", "Qty Sold", "Gross Sales", "% of Total"]);
  for (const item of report.by_item) {
    rows.push([
      item.name,
      String(item.qty_sold),
      toDollars(item.gross_cents),
      item.pct_of_total.toFixed(2),
    ]);
  }

  // ── By-staff section ─────────────────────────────────────────────────────
  rows.push([]);
  rows.push(["By Staff"]);
  rows.push(["Staff Member", "Tickets", "Gross Sales", "Tips"]);
  for (const staff of report.by_staff) {
    rows.push([
      staff.full_name,
      String(staff.ticket_count),
      toDollars(staff.gross_cents),
      toDollars(staff.tips_cents),
    ]);
  }

  // ── By-payment-method section ─────────────────────────────────────────────
  rows.push([]);
  rows.push(["By Payment Method"]);
  rows.push(["Method", "Count", "Gross Sales"]);
  for (const method of report.by_method) {
    rows.push([
      method.method,
      String(method.count),
      toDollars(method.gross_cents),
    ]);
  }

  return stringify(rows);
}

// ---------------------------------------------------------------------------
// Helpers (duplicated from end-of-day.ts to avoid coupling)
// ---------------------------------------------------------------------------

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function shiftDate(dateStr: string, offsetHours: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Date(d.getTime() + offsetHours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// GET /v1/reports/end-of-day.csv
// ---------------------------------------------------------------------------
csvRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = GetEndOfDayQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid query params", details: parsed.error.flatten() } });
      return;
    }

    const { date, location_id } = parsed.data;
    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: tenant } = await db.from("tenants").select("timezone").eq("id", tenantId).single();
    const timezone: string = (tenant?.timezone as string | null) ?? "America/Chicago";
    const today = todayInTz(timezone);

    if (date > today) {
      res.status(400).json({ error: { code: "date_in_future", message: "Report date cannot be in the future" } });
      return;
    }

    // Try snapshot first for past dates
    let report: EndOfDayReport | null = null;

    if (date < today) {
      const { data: snapshot } = await db
        .from("reports_daily")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("date", date)
        .is("location_id", null)
        .maybeSingle();

      if (snapshot) {
        report = {
          tenant_id: tenantId,
          location_id: location_id ?? null,
          date,
          is_snapshot: true,
          snapshot_at: snapshot.snapshot_at as string,
          gross_sales_cents: snapshot.gross_sales_cents as number,
          taxable_cents: snapshot.taxable_cents as number,
          tax_cents: snapshot.tax_cents as number,
          tips_cents: snapshot.tips_cents as number,
          discounts_cents: snapshot.discounts_cents as number,
          voids_cents: snapshot.voids_cents as number,
          refunds_cents: snapshot.refunds_cents as number,
          net_cents: snapshot.net_cents as number,
          order_count: snapshot.order_count as number,
          paid_order_count: snapshot.paid_order_count as number,
          voided_order_count: snapshot.voided_order_count as number,
          by_method: (snapshot.by_method as EndOfDayReport["by_method"]) ?? [],
          by_item: (snapshot.by_item as EndOfDayReport["by_item"]) ?? [],
          by_staff: (snapshot.by_staff as EndOfDayReport["by_staff"]) ?? [],
        };
      }
    }

    if (!report) {
      // Live aggregation
      const queryStart = shiftDate(date, -36);
      const queryEnd = shiftDate(date, 36);

      const { data: orders } = await db
        .from("orders")
        .select("id, status, subtotal_cents, tax_cents, tip_cents, opened_by_staff_id, created_at, voided_at, closed_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", queryStart)
        .lte("created_at", queryEnd);

      const orderIds = (orders ?? []).map((o: { id: string }) => o.id);

      let payments: Array<{ id: string; order_id: string; method: string; amount_cents: number; tip_cents: number; status: string; created_at: string }> = [];
      let orderItems: unknown[] = [];
      let staffMembers: unknown[] = [];
      let menuItems: unknown[] = [];
      let refunds: Array<{ id: string; order_id: string; amount_cents: number; created_at: string }> = [];

      if (orderIds.length > 0) {
        const [oi, pay, staff, menu] = await Promise.all([
          db.from("order_items").select("id, order_id, menu_item_id, name_snapshot, qty, price_cents, status").in("order_id", orderIds),
          db.from("payments").select("id, order_id, method, amount_cents, tip_cents, status, created_at").in("order_id", orderIds),
          db.from("staff_members").select("id, full_name").eq("tenant_id", tenantId),
          db.from("menu_items").select("id, taxable").eq("tenant_id", tenantId),
        ]);
        orderItems = oi.data ?? [];
        payments = pay.data ?? [];
        staffMembers = staff.data ?? [];
        menuItems = menu.data ?? [];

        const paymentIds = payments.map((p) => p.id);
        if (paymentIds.length > 0) {
          const { data: refundsRaw } = await db
            .from("refunds").select("id, payment_id, amount_cents, created_at").in("payment_id", paymentIds);
          const paymentToOrder = new Map(payments.map((p) => [p.id, p.order_id]));
          refunds = ((refundsRaw ?? []) as Array<{ id: string; payment_id: string; amount_cents: number; created_at: string }>)
            .filter((r) => paymentToOrder.has(r.payment_id))
            .map((r) => ({ id: r.id, order_id: paymentToOrder.get(r.payment_id)!, amount_cents: r.amount_cents, created_at: r.created_at }));
        }
      }

      const agg = aggregateEndOfDay({
        date, timezone,
        orders: orders ?? [],
        orderItems: orderItems as Parameters<typeof aggregateEndOfDay>[0]["orderItems"],
        payments,
        refunds,
        cashEvents: [],
        staffMembers: staffMembers as Parameters<typeof aggregateEndOfDay>[0]["staffMembers"],
        menuItems: menuItems as Parameters<typeof aggregateEndOfDay>[0]["menuItems"],
        salesTaxBps: 825,
      });

      report = {
        tenant_id: tenantId,
        location_id: location_id ?? null,
        date,
        is_snapshot: false,
        snapshot_at: null,
        ...agg,
        by_method: agg.by_method as EndOfDayReport["by_method"],
        by_item: agg.by_item as EndOfDayReport["by_item"],
        by_staff: agg.by_staff as EndOfDayReport["by_staff"],
      };
    }

    if (!report) {
      res.status(500).json({ error: { code: "internal_error", message: "Failed to compute report" } });
      return;
    }

    const csv = reportToCsv(report);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${date}.csv"`
    );
    res.send(csv);
  }
);
