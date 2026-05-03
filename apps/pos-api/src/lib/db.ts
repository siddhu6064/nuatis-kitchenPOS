import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Tenant-scoped query helpers
// ---------------------------------------------------------------------------
// Always use these instead of client.from() directly.
// service_role bypasses RLS — these helpers enforce tenant isolation in code.

/**
 * Returns a SELECT query pre-filtered by tenant_id.
 * Use for reading records scoped to a tenant.
 */
export function tenantSelect(
  client: SupabaseClient,
  table: string,
  tenantId: string,
  columns = "*"
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).from(table).select(columns).eq("tenant_id", tenantId);
}

/**
 * Asserts that a row with `id` belongs to `tenantId`.
 * Returns null if not found / wrong tenant. Throws on DB error.
 */
export async function assertTenantOwns(
  client: SupabaseClient,
  table: string,
  id: string,
  tenantId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

// ---------------------------------------------------------------------------
// Pure math — extractable for unit tests (no DB required)
// ---------------------------------------------------------------------------

export interface DiscountInput {
  type: "pct" | "amt";
  value_bps: number | null;
  value_cents: number | null;
}

export interface ComputeOrderTotalsResult {
  subtotal_cents: number;
  taxable_subtotal_cents: number;
  discount_total_cents: number;
  tax_cents: number;
  total_cents: number;
  /** applied_amount_cents per discount, in the same order as `discounts` param */
  applied_amounts: number[];
}

/**
 * Pure computation of order totals after discounts.
 * Uses Math.floor() exclusively — never Math.round() — for predictable
 * penny-precise results that match most state tax-after-discount rules.
 *
 * Tax reduction is proportional to the taxable fraction of the subtotal:
 *   taxable_after_discount = floor(taxable_subtotal * (subtotal - discount_total) / subtotal)
 *
 * All values are in integer cents.
 */
export function computeOrderTotals(params: {
  items: { price_cents: number; qty: number; taxable: boolean }[];
  discounts: DiscountInput[];
  tip_cents: number;
  sales_tax_bps: number;
}): ComputeOrderTotalsResult {
  const subtotal_cents = params.items.reduce(
    (sum, i) => sum + i.price_cents * i.qty,
    0
  );

  const taxable_subtotal_cents = params.items
    .filter((i) => i.taxable)
    .reduce((sum, i) => sum + i.price_cents * i.qty, 0);

  const applied_amounts: number[] = [];
  let prior_discount_sum = 0;

  for (const d of params.discounts) {
    let this_discount: number;
    if (d.type === "pct") {
      this_discount = Math.floor(
        (subtotal_cents * (d.value_bps ?? 0)) / 10000
      );
    } else {
      this_discount = Math.min(
        d.value_cents ?? 0,
        Math.max(0, subtotal_cents - prior_discount_sum)
      );
    }
    applied_amounts.push(this_discount);
    prior_discount_sum += this_discount;
  }

  const discount_total_cents = applied_amounts.reduce((sum, a) => sum + a, 0);

  const taxable_after_discount = Math.floor(
    (taxable_subtotal_cents * (subtotal_cents - discount_total_cents)) /
      Math.max(subtotal_cents, 1)
  );

  const tax_cents = Math.floor(
    (taxable_after_discount * params.sales_tax_bps) / 10000
  );

  const total_cents =
    subtotal_cents - discount_total_cents + tax_cents + params.tip_cents;

  return {
    subtotal_cents,
    taxable_subtotal_cents,
    discount_total_cents,
    tax_cents,
    total_cents,
    applied_amounts,
  };
}

// ---------------------------------------------------------------------------
// Order total recalculation — call after any item add/void/discount change
// ---------------------------------------------------------------------------

/**
 * Recomputes all order totals (subtotal, discounts, tax, total) by:
 *   1. Summing non-voided item lines
 *   2. Applying non-voided discounts in applied_at order
 *   3. Proportionally reducing the taxable fraction
 *   4. Computing tax at the location's sales_tax_bps rate
 *
 * Persists: subtotal_cents, discount_total_cents, tax_cents, total_cents,
 * and the applied_amount_cents on each active order_discount row.
 *
 * Returns subtotal_cents for backward compatibility with existing callers.
 */
export async function recalcOrderTotals(
  client: SupabaseClient,
  order_id: string,
  tenant_id: string
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Fetch order (need location_id for tax rate, tip_cents for total)
  const { data: order } = await db
    .from("orders")
    .select("location_id, tip_cents")
    .eq("id", order_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  const tip_cents: number = (order?.tip_cents as number) ?? 0;
  const location_id: string | null = (order?.location_id as string) ?? null;

  // Fetch non-voided items
  const { data: items } = await db
    .from("order_items")
    .select("price_cents, qty, taxable")
    .eq("order_id", order_id)
    .neq("status", "voided");

  // Fetch non-voided discounts in applied_at order
  const { data: discounts } = await db
    .from("order_discounts")
    .select("id, type, value_bps, value_cents")
    .eq("order_id", order_id)
    .eq("tenant_id", tenant_id)
    .is("voided_at", null)
    .order("applied_at", { ascending: true });

  // Fetch location tax rate
  let sales_tax_bps = 825; // safe default
  if (location_id) {
    const { data: loc } = await db
      .from("locations")
      .select("sales_tax_bps")
      .eq("id", location_id)
      .maybeSingle();
    if (loc?.sales_tax_bps != null) {
      sales_tax_bps = loc.sales_tax_bps as number;
    }
  }

  const itemRows = (
    items ?? []
  ) as { price_cents: number; qty: number; taxable: boolean }[];

  const discountRows = (discounts ?? []) as {
    id: string;
    type: "pct" | "amt";
    value_bps: number | null;
    value_cents: number | null;
  }[];

  const result = computeOrderTotals({
    items: itemRows,
    discounts: discountRows,
    tip_cents,
    sales_tax_bps,
  });

  // Persist applied_amount_cents on each discount row
  for (let i = 0; i < discountRows.length; i++) {
    const row = discountRows[i];
    const amount = result.applied_amounts[i] ?? 0;
    if (row) {
      await db
        .from("order_discounts")
        .update({ applied_amount_cents: amount })
        .eq("id", row.id);
    }
  }

  // Persist all totals on the order
  await db
    .from("orders")
    .update({
      subtotal_cents: result.subtotal_cents,
      discount_total_cents: result.discount_total_cents,
      tax_cents: result.tax_cents,
      total_cents: result.total_cents,
    })
    .eq("id", order_id)
    .eq("tenant_id", tenant_id);

  return result.subtotal_cents;
}

// ---------------------------------------------------------------------------
// Cash drawer helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the expected cash in the drawer at close time.
 *
 * Formula:
 *   expected = opening_float
 *            + Σ cash_sale      (cash received from customers)
 *            - Σ cash_refund    (cash given back to customers)
 *            + Σ pay_in         (manager adds cash to drawer)
 *            - Σ pay_out        (manager removes cash from drawer)
 *
 * no_sale events have no effect on expected cash (they open the drawer
 * without changing the balance).
 *
 * Variance can be negative (cashier is short) or positive (cashier is over).
 * All amounts are in cents (integers).
 */
export function calculateExpectedCash(
  openingFloatCents: number,
  events: { type: string; amount_cents: number }[]
): number {
  let expected = openingFloatCents;

  for (const e of events) {
    switch (e.type) {
      case "cash_sale":
        expected += e.amount_cents;
        break;
      case "cash_refund":
        expected -= e.amount_cents;
        break;
      case "pay_in":
        expected += e.amount_cents;
        break;
      case "pay_out":
        expected -= e.amount_cents;
        break;
      // no_sale: drawer opened with no balance change — no effect
    }
  }

  return expected;
}

// ---------------------------------------------------------------------------
// Audit log helper — fire-and-forget
// ---------------------------------------------------------------------------
export function writeAuditLog(
  client: SupabaseClient,
  params: {
    tenant_id: string;
    staff_id?: string | null;
    action: string;
    target_type?: string;
    target_id?: string;
    payload?: unknown;
    ip_address?: string;
  }
): void {
  void client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("audit_log" as any)
    .insert({
      tenant_id: params.tenant_id,
      staff_id: params.staff_id ?? null,
      action: params.action,
      target_type: params.target_type ?? null,
      target_id: params.target_id ?? null,
      payload: params.payload ?? null,
      ip_address: params.ip_address ?? null,
    })
    .then(({ error }) => {
      if (error) logger.warn({ err: error }, "audit_log write failed");
    });
}
