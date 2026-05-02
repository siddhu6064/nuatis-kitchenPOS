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
// Order total recalculation — call after any item add/void
// ---------------------------------------------------------------------------

/**
 * Sums price_cents * qty for all non-voided order_items, persists
 * the result to orders.subtotal_cents, and returns the new subtotal.
 */
export async function recalcOrderTotals(
  client: SupabaseClient,
  order_id: string,
  tenant_id: string
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: items } = await db
    .from("order_items")
    .select("price_cents, qty")
    .eq("order_id", order_id)
    .neq("status", "voided");

  const subtotal_cents: number = ((items ?? []) as { price_cents: number; qty: number }[]).reduce(
    (sum, row) => sum + row.price_cents * row.qty,
    0
  );

  await db
    .from("orders")
    .update({ subtotal_cents })
    .eq("id", order_id)
    .eq("tenant_id", tenant_id);

  return subtotal_cents;
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
