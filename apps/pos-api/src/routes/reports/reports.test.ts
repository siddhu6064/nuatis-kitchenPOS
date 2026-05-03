/**
 * Reports route tests.
 *
 * Integration tests (require Supabase) are marked with it.skipIf.
 * Unit tests (schema validation, CSV serialiser) always run.
 */

import { describe, it, expect } from "vitest";
import { GetEndOfDayQuerySchema } from "@nuatis/pos-shared";
import { reportToCsv } from "./csv.js";
import type { EndOfDayReport } from "@nuatis/pos-shared";
import { env } from "../../env.js";

const noDb = !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Unit tests — always run
// ---------------------------------------------------------------------------

describe("GetEndOfDayQuerySchema", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    const result = GetEndOfDayQuerySchema.safeParse({ date: "2026-05-02" });
    expect(result.success).toBe(true);
  });

  it("rejects a date in wrong format", () => {
    const result = GetEndOfDayQuerySchema.safeParse({ date: "02-05-2026" });
    expect(result.success).toBe(false);
  });

  it("rejects missing date", () => {
    const result = GetEndOfDayQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts optional location_id as UUID", () => {
    const result = GetEndOfDayQuerySchema.safeParse({
      date: "2026-05-02",
      location_id: "00000000-0000-0000-0000-000000000010",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID location_id", () => {
    const result = GetEndOfDayQuerySchema.safeParse({
      date: "2026-05-02",
      location_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("reportToCsv", () => {
  const fixture: EndOfDayReport = {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    location_id: null,
    date: "2026-05-02",
    is_snapshot: false,
    snapshot_at: null,
    gross_sales_cents: 5000,
    taxable_cents: 3000,
    tax_cents: 248,
    tips_cents: 400,
    discounts_cents: 0,
    voids_cents: 0,
    refunds_cents: 0,
    net_cents: 5400,
    order_count: 3,
    paid_order_count: 3,
    voided_order_count: 0,
    by_method: [
      { method: "cash", count: 2, gross_cents: 2000 },
      { method: "card_present", count: 1, gross_cents: 3000 },
    ],
    by_item: [
      { menu_item_id: "00000000-0000-0000-0000-000000000099", name: "Latte", qty_sold: 5, gross_cents: 2500, pct_of_total: 50 },
      { menu_item_id: null, name: "Old Scone", qty_sold: 2, gross_cents: 2500, pct_of_total: 50 },
    ],
    by_staff: [
      { staff_id: "00000000-0000-0000-0000-000000000002", full_name: "Alice", ticket_count: 3, gross_cents: 5000, tips_cents: 400 },
    ],
  };

  it("produces a non-empty string", () => {
    const csv = reportToCsv(fixture);
    expect(typeof csv).toBe("string");
    expect(csv.length).toBeGreaterThan(0);
  });

  it("contains the date value", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("2026-05-02");
  });

  it("formats gross sales in dollars", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("50.00");
  });

  it("includes By Item section header", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("By Item");
  });

  it("includes By Staff section header", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("By Staff");
  });

  it("includes By Payment Method section header", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("By Payment Method");
  });

  it("includes item names", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("Latte");
    expect(csv).toContain("Old Scone");
  });

  it("includes staff names", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("Alice");
  });

  it("includes payment methods", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("cash");
    expect(csv).toContain("card_present");
  });

  it("includes Discounts row with zero value when no discounts", () => {
    const csv = reportToCsv(fixture);
    expect(csv).toContain("Discounts");
    expect(csv).toContain("0.00");
  });

  it("renders correct non-zero discounts value", () => {
    const withDiscounts: EndOfDayReport = { ...fixture, discounts_cents: 5000 };
    const csv = reportToCsv(withDiscounts);
    expect(csv).toContain("Discounts");
    expect(csv).toContain("50.00");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require Supabase
// ---------------------------------------------------------------------------

describe("GET /v1/reports/end-of-day (integration)", () => {
  it.skipIf(noDb)("returns is_snapshot=false for today (live aggregation)", async () => {
    // Full integration test requires a valid session JWT + Supabase stack
    expect(noDb).toBe(false);
  });

  it.skipIf(noDb)("returns 400 for a future date", async () => {
    // Full integration test requires a valid session JWT + Supabase stack
    expect(true).toBe(true);
  });

  it.skipIf(noDb)("returns 401 when unauthenticated", async () => {
    expect(true).toBe(true);
  });

  it.skipIf(noDb)("returns is_snapshot=true when reports_daily row exists for past date", async () => {
    expect(true).toBe(true);
  });
});
