/**
 * Pure aggregation logic for end-of-day reports.
 *
 * No Express, no DB client — all inputs are plain data arrays.
 * This makes the function straightforwardly unit-testable.
 *
 * Date boundary rule:
 *   A row counts for date X if its relevant timestamp falls within
 *   X 00:00:00 to X 23:59:59.999 in the tenant's local timezone.
 *
 * Aggregation rules:
 *   gross_sales_cents  = Σ (payment.amount_cents − payment.tip_cents) for succeeded payments
 *   tips_cents         = Σ payment.tip_cents for succeeded payments
 *   tax_cents          = Σ order.tax_cents for paid orders on the date
 *   taxable_cents      = Σ (item.price_cents × qty) for non-voided items in paid orders
 *                        where the menu item's taxable=true (deleted items → non-taxable)
 *   voids_cents        = Σ (order.subtotal_cents + order.tax_cents) for voided orders
 *                        filtered by voided_at (not created_at)
 *   refunds_cents      = Σ refund.amount_cents where refund.created_at is on the date
 *   discounts_cents    = Σ order_discount.applied_amount_cents for non-voided discounts
 *                        on paid orders that closed on the report date
 *   net_cents          = gross_sales_cents + tips_cents − refunds_cents
 */

import type { PaymentMethodBreakdown } from "@nuatis/pos-shared";

// ---------------------------------------------------------------------------
// Input row shapes (DB-agnostic plain objects)
// ---------------------------------------------------------------------------

export interface OrderRow {
  id: string;
  status: "open" | "sent_to_kitchen" | "paid" | "voided";
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  opened_by_staff_id: string | null;
  created_at: string;
  voided_at: string | null;
  closed_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  qty: number;
  price_cents: number;
  status: string; // 'active' | 'voided'
}

export interface PaymentRow {
  id: string;
  order_id: string;
  method: PaymentMethodBreakdown["method"];
  amount_cents: number;
  tip_cents: number;
  status: string; // 'pending' | 'succeeded' | 'failed' | 'refunded'
  created_at: string;
}

export interface RefundRow {
  id: string;
  order_id: string;
  amount_cents: number;
  created_at: string;
}

export interface CashEventRow {
  id: string;
  order_id: string | null;
  amount_cents: number;
  created_at: string;
}

export interface StaffMemberRow {
  id: string;
  full_name: string;
}

export interface MenuItemRow {
  id: string;
  taxable: boolean;
}

export interface OrderDiscountRow {
  id: string;
  order_id: string;
  applied_amount_cents: number;
  voided_at: string | null;
}

// ---------------------------------------------------------------------------
// Output shape (matches EndOfDayReportSchema minus the envelope fields)
// ---------------------------------------------------------------------------

export interface AggregateResult {
  gross_sales_cents: number;
  taxable_cents: number;
  tax_cents: number;
  tips_cents: number;
  discounts_cents: number;
  voids_cents: number;
  refunds_cents: number;
  net_cents: number;
  order_count: number;
  paid_order_count: number;
  voided_order_count: number;
  by_method: Array<{
    method: PaymentMethodBreakdown["method"];
    count: number;
    gross_cents: number;
  }>;
  by_item: Array<{
    menu_item_id: string | null;
    name: string;
    qty_sold: number;
    gross_cents: number;
    pct_of_total: number;
  }>;
  by_staff: Array<{
    staff_id: string;
    full_name: string;
    ticket_count: number;
    gross_cents: number;
    tips_cents: number;
  }>;
}

export interface AggregateParams {
  date: string;        // YYYY-MM-DD — the report date
  timezone: string;    // IANA timezone, e.g. "America/Chicago"
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  payments: PaymentRow[];
  refunds: RefundRow[];
  cashEvents: CashEventRow[]; // reserved for future cash-reconciliation features
  staffMembers: StaffMemberRow[];
  menuItems: MenuItemRow[];
  salesTaxBps: number; // reserved for future tax validation
  discounts?: OrderDiscountRow[]; // non-voided discounts on paid orders
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

/**
 * Returns the YYYY-MM-DD date string for a UTC timestamp in the given timezone.
 * Uses Intl.DateTimeFormat with "en-CA" locale which always formats as YYYY-MM-DD.
 */
export function toTenantDateStr(utcTimestamp: string | Date, tz: string): string {
  const d = typeof utcTimestamp === "string" ? new Date(utcTimestamp) : utcTimestamp;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Core aggregation
// ---------------------------------------------------------------------------

export function aggregateEndOfDay(params: AggregateParams): AggregateResult {
  const { date, timezone, orders, orderItems, payments, refunds, staffMembers, menuItems } = params;
  const discountRows = params.discounts ?? [];

  // Build lookup maps for O(1) access
  const menuItemMap = new Map<string, MenuItemRow>(menuItems.map((m) => [m.id, m]));
  const staffMap = new Map<string, StaffMemberRow>(staffMembers.map((s) => [s.id, s]));

  // ── Date-filtered order sets ──────────────────────────────────────────────

  // Paid orders: use closed_at if available, else created_at for date boundary
  const paidOrders = orders.filter(
    (o) =>
      o.status === "paid" &&
      toTenantDateStr(o.closed_at ?? o.created_at, timezone) === date
  );

  // Voided orders: use voided_at per spec (not created_at / opened_at)
  const voidedOrders = orders.filter(
    (o) =>
      o.status === "voided" &&
      o.voided_at !== null &&
      o.voided_at !== undefined &&
      toTenantDateStr(o.voided_at, timezone) === date
  );

  // All orders whose creation date falls on the report date (for order_count)
  const allDayOrders = orders.filter(
    (o) => toTenantDateStr(o.created_at, timezone) === date
  );

  const paidOrderIds = new Set<string>(paidOrders.map((o) => o.id));

  // ── Payments ──────────────────────────────────────────────────────────────

  const succeededPayments = payments.filter(
    (p) =>
      p.status === "succeeded" &&
      toTenantDateStr(p.created_at, timezone) === date
  );

  const gross_sales_cents = succeededPayments.reduce(
    (sum, p) => sum + p.amount_cents - p.tip_cents,
    0
  );
  const tips_cents = succeededPayments.reduce((sum, p) => sum + p.tip_cents, 0);

  // ── Tax & taxable sales ───────────────────────────────────────────────────

  const tax_cents = paidOrders.reduce((sum, o) => sum + o.tax_cents, 0);

  const activeItemsInPaidOrders = orderItems.filter(
    (i) => paidOrderIds.has(i.order_id) && i.status !== "voided"
  );

  const taxable_cents = activeItemsInPaidOrders.reduce((sum, i) => {
    const menuItem = i.menu_item_id ? menuItemMap.get(i.menu_item_id) : null;
    return menuItem?.taxable ? sum + i.price_cents * i.qty : sum;
  }, 0);

  // ── Discounts ─────────────────────────────────────────────────────────────
  // Sum applied_amount_cents for non-voided discounts on paid orders on the date.

  const discounts_cents = discountRows
    .filter((d) => paidOrderIds.has(d.order_id) && !d.voided_at)
    .reduce((sum, d) => sum + d.applied_amount_cents, 0);

  // ── Voids ─────────────────────────────────────────────────────────────────

  const voids_cents = voidedOrders.reduce(
    (sum, o) => sum + o.subtotal_cents + o.tax_cents,
    0
  );

  // ── Refunds ───────────────────────────────────────────────────────────────

  const dayRefunds = refunds.filter(
    (r) => toTenantDateStr(r.created_at, timezone) === date
  );
  const refunds_cents = dayRefunds.reduce((sum, r) => sum + r.amount_cents, 0);

  // ── Totals ────────────────────────────────────────────────────────────────

  const net_cents = gross_sales_cents + tips_cents - refunds_cents;

  const order_count = allDayOrders.length;
  const paid_order_count = paidOrders.length;
  const voided_order_count = voidedOrders.length;

  // ── by_method ─────────────────────────────────────────────────────────────

  const methodMap = new Map<PaymentMethodBreakdown["method"], { count: number; gross_cents: number }>();
  for (const p of succeededPayments) {
    const existing = methodMap.get(p.method) ?? { count: 0, gross_cents: 0 };
    methodMap.set(p.method, {
      count: existing.count + 1,
      gross_cents: existing.gross_cents + p.amount_cents - p.tip_cents,
    });
  }
  const by_method = Array.from(methodMap.entries()).map(([method, v]) => ({
    method,
    count: v.count,
    gross_cents: v.gross_cents,
  }));

  // ── by_item ───────────────────────────────────────────────────────────────

  // Group by menu_item_id; for deleted items (null id), group by name_snapshot
  const itemAccumMap = new Map<
    string,
    { menu_item_id: string | null; name: string; qty_sold: number; gross_cents: number }
  >();

  for (const i of activeItemsInPaidOrders) {
    // Key: uuid for known items, "null:<name>" for deleted items
    const key = i.menu_item_id ?? `null:${i.name_snapshot}`;
    const existing = itemAccumMap.get(key) ?? {
      menu_item_id: i.menu_item_id,
      name: i.name_snapshot,
      qty_sold: 0,
      gross_cents: 0,
    };
    itemAccumMap.set(key, {
      menu_item_id: i.menu_item_id,
      name: i.name_snapshot,
      qty_sold: existing.qty_sold + i.qty,
      gross_cents: existing.gross_cents + i.price_cents * i.qty,
    });
  }

  const totalItemGross = Array.from(itemAccumMap.values()).reduce(
    (s, v) => s + v.gross_cents,
    0
  );

  const by_item = Array.from(itemAccumMap.values()).map((v) => ({
    menu_item_id: v.menu_item_id,
    name: v.name,
    qty_sold: v.qty_sold,
    gross_cents: v.gross_cents,
    pct_of_total:
      totalItemGross > 0
        ? Math.round((v.gross_cents / totalItemGross) * 10_000) / 100
        : 0,
  }));

  // ── by_staff ──────────────────────────────────────────────────────────────

  // Build a map of order_id → succeeded payment totals for fast lookup
  const paymentsByOrder = new Map<
    string,
    { gross_cents: number; tips_cents: number }
  >();
  for (const p of succeededPayments) {
    const existing = paymentsByOrder.get(p.order_id) ?? {
      gross_cents: 0,
      tips_cents: 0,
    };
    paymentsByOrder.set(p.order_id, {
      gross_cents: existing.gross_cents + p.amount_cents - p.tip_cents,
      tips_cents: existing.tips_cents + p.tip_cents,
    });
  }

  const staffAccumMap = new Map<
    string,
    { ticket_count: number; gross_cents: number; tips_cents: number }
  >();

  for (const o of paidOrders) {
    if (!o.opened_by_staff_id) continue;
    const existing = staffAccumMap.get(o.opened_by_staff_id) ?? {
      ticket_count: 0,
      gross_cents: 0,
      tips_cents: 0,
    };
    const orderTotals = paymentsByOrder.get(o.id) ?? {
      gross_cents: 0,
      tips_cents: 0,
    };
    staffAccumMap.set(o.opened_by_staff_id, {
      ticket_count: existing.ticket_count + 1,
      gross_cents: existing.gross_cents + orderTotals.gross_cents,
      tips_cents: existing.tips_cents + orderTotals.tips_cents,
    });
  }

  const by_staff = Array.from(staffAccumMap.entries()).map(([staffId, v]) => {
    const member = staffMap.get(staffId);
    return {
      staff_id: staffId,
      full_name: member?.full_name ?? "Unknown",
      ticket_count: v.ticket_count,
      gross_cents: v.gross_cents,
      tips_cents: v.tips_cents,
    };
  });

  return {
    gross_sales_cents,
    taxable_cents,
    tax_cents,
    tips_cents,
    discounts_cents,
    voids_cents,
    refunds_cents,
    net_cents,
    order_count,
    paid_order_count,
    voided_order_count,
    by_method,
    by_item,
    by_staff,
  };
}
