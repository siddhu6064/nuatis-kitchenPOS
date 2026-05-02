import { Router, type IRouter, type Request, type Response } from "express";
import { GetEndOfDayQuerySchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { aggregateEndOfDay } from "../../lib/reports.js";
import { logger } from "../../lib/logger.js";

export const endOfDayRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's YYYY-MM-DD in the given IANA timezone. */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/**
 * Returns a UTC ISO string that is `offsetHours` hours offset from a
 * date string like "YYYY-MM-DD". Used to build a rough DB query window.
 */
function shiftDate(dateStr: string, offsetHours: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Date(d.getTime() + offsetHours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// GET /v1/reports/end-of-day
// ---------------------------------------------------------------------------
endOfDayRouter.get(
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

    // Fetch tenant (timezone)
    const { data: tenant, error: tenantErr } = await db
      .from("tenants")
      .select("timezone, name")
      .eq("id", tenantId)
      .single();

    if (tenantErr || !tenant) {
      res.status(503).json({ error: { code: "internal_error", message: "Tenant lookup failed" } });
      return;
    }

    const timezone: string = (tenant.timezone as string | null) ?? "America/Chicago";
    const today = todayInTz(timezone);

    // Date validation
    if (date > today) {
      res.status(400).json({ error: { code: "date_in_future", message: "Report date cannot be in the future" } });
      return;
    }

    // Log rare old-date queries for observability
    const daysDiff = Math.floor((Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000);
    if (daysDiff > 90) {
      logger.info({ tenant_id: tenantId, date, days_ago: daysDiff }, "end-of-day report requested for a date older than 90 days");
    }

    // If past date, check for existing snapshot first
    if (date < today) {
      const snapshotQuery = db
        .from("reports_daily")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("date", date)
        .is("location_id", null);

      if (location_id) {
        snapshotQuery.eq("location_id", location_id);
      }

      const { data: snapshot } = await snapshotQuery.maybeSingle();

      if (snapshot) {
        res.json({
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
          by_method: snapshot.by_method as unknown[],
          by_item: snapshot.by_item as unknown[],
          by_staff: snapshot.by_staff as unknown[],
        });
        return;
      }
    }

    // Live aggregation — fetch raw data with a ±36-hour UTC window
    const queryStart = shiftDate(date, -36);
    const queryEnd = shiftDate(date, 36);

    // Fetch orders in window
    const { data: orders, error: ordersErr } = await db
      .from("orders")
      .select("id, status, subtotal_cents, tax_cents, tip_cents, opened_by_staff_id, created_at, voided_at, closed_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", queryStart)
      .lte("created_at", queryEnd);

    if (ordersErr) {
      res.status(500).json({ error: { code: "internal_error", message: ordersErr.message } });
      return;
    }

    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);

    if (orderIds.length === 0) {
      // No orders at all — return empty report
      res.json({
        tenant_id: tenantId,
        location_id: location_id ?? null,
        date,
        is_snapshot: false,
        snapshot_at: null,
        gross_sales_cents: 0, taxable_cents: 0, tax_cents: 0, tips_cents: 0,
        discounts_cents: 0, voids_cents: 0, refunds_cents: 0, net_cents: 0,
        order_count: 0, paid_order_count: 0, voided_order_count: 0,
        by_method: [], by_item: [], by_staff: [],
      });
      return;
    }

    // Fetch related data in parallel
    const [
      { data: orderItems },
      { data: payments },
      { data: staffMembers },
      { data: menuItems },
    ] = await Promise.all([
      db.from("order_items")
        .select("id, order_id, menu_item_id, name_snapshot, qty, price_cents, status")
        .in("order_id", orderIds),
      db.from("payments")
        .select("id, order_id, method, amount_cents, tip_cents, status, created_at")
        .in("order_id", orderIds),
      db.from("staff_members")
        .select("id, full_name")
        .eq("tenant_id", tenantId),
      db.from("menu_items")
        .select("id, taxable")
        .eq("tenant_id", tenantId),
    ]);

    // Fetch refunds via payments → order_id
    const paymentIds = (payments ?? []).map((p: { id: string }) => p.id);
    let refunds: Array<{ id: string; order_id: string; amount_cents: number; created_at: string }> = [];

    if (paymentIds.length > 0) {
      const { data: refundsRaw } = await db
        .from("refunds")
        .select("id, payment_id, amount_cents, created_at")
        .in("payment_id", paymentIds);

      const paymentToOrder = new Map(
        (payments ?? []).map((p: { id: string; order_id: string }) => [p.id, p.order_id])
      );

      refunds = ((refundsRaw ?? []) as Array<{
        id: string; payment_id: string; amount_cents: number; created_at: string
      }>)
        .filter((r) => paymentToOrder.has(r.payment_id))
        .map((r) => ({
          id: r.id,
          order_id: paymentToOrder.get(r.payment_id) as string,
          amount_cents: r.amount_cents,
          created_at: r.created_at,
        }));
    }

    const result = aggregateEndOfDay({
      date,
      timezone,
      orders: orders ?? [],
      orderItems: orderItems ?? [],
      payments: payments ?? [],
      refunds,
      cashEvents: [],
      staffMembers: staffMembers ?? [],
      menuItems: menuItems ?? [],
      salesTaxBps: 825,
    });

    res.json({
      tenant_id: tenantId,
      location_id: location_id ?? null,
      date,
      is_snapshot: false,
      snapshot_at: null,
      ...result,
    });
  }
);
