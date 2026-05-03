import { describe, it, expect, vi } from "vitest";
import { tenantSelect, assertTenantOwns, recalcOrderTotals, calculateExpectedCash } from "./db.js";

// ---------------------------------------------------------------------------
// Mock a minimal Supabase client (single resolve)
// ---------------------------------------------------------------------------
function makeMockClient(resolveWith: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolveWith),
    // Allow bare await on the chain (update path)
    then: (resolve: (v: typeof resolveWith) => void) => Promise.resolve(resolveWith).then(resolve),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// Multi-call mock: each call to from() gets its own resolve
function makeMockClientMulti(calls: { data: unknown; error: null }[]) {
  let callIdx = 0;
  const chains: ReturnType<typeof makeMockClient>["_chain"][] = calls.map((resolveWith) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolveWith),
    then: (resolve: (v: typeof resolveWith) => void) => Promise.resolve(resolveWith).then(resolve),
  }));

  return {
    from: vi.fn().mockImplementation(() => {
      const c = chains[callIdx] ?? chains[chains.length - 1]!;
      callIdx++;
      return c;
    }),
    _chains: chains,
  };
}

describe("tenantSelect", () => {
  it("calls from() with the correct table name", () => {
    const mock = makeMockClient({ data: [], error: null });
    tenantSelect(mock as unknown as Parameters<typeof tenantSelect>[0], "menu_items", "tenant-abc");
    expect(mock.from).toHaveBeenCalledWith("menu_items");
  });

  it("chains .eq('tenant_id', tenantId)", () => {
    const mock = makeMockClient({ data: [], error: null });
    tenantSelect(mock as unknown as Parameters<typeof tenantSelect>[0], "menu_items", "tenant-abc");
    expect(mock._chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-abc");
  });

  it("uses custom columns when provided", () => {
    const mock = makeMockClient({ data: [], error: null });
    tenantSelect(mock as unknown as Parameters<typeof tenantSelect>[0], "menu_items", "tenant-abc", "id, name");
    expect(mock._chain.select).toHaveBeenCalledWith("id, name");
  });
});

describe("recalcOrderTotals", () => {
  // New call order:
  //   call 1: from("orders")        → select location_id + tip_cents → maybeSingle
  //   call 2: from("order_items")   → select price_cents, qty, taxable → awaited directly
  //   call 3: from("order_discounts")→ select non-voided discounts   → awaited directly
  //   call 4: from("locations")     → select sales_tax_bps           → maybeSingle
  //   call 5: from("orders")        → update totals                  → awaited directly

  it("sums price_cents * qty for non-voided items and returns subtotal", async () => {
    const items = [
      { price_cents: 300, qty: 1, taxable: true },   // 300
      { price_cents: 450, qty: 2, taxable: true },   // 900
    ];
    const mock = makeMockClientMulti([
      { data: { location_id: "loc-1", tip_cents: 0 }, error: null }, // orders fetch
      { data: items, error: null },                                    // order_items
      { data: [], error: null },                                       // order_discounts
      { data: { sales_tax_bps: 825 }, error: null },                  // locations
      { data: {}, error: null },                                       // orders update
    ]);

    const subtotal = await recalcOrderTotals(
      mock as unknown as Parameters<typeof recalcOrderTotals>[0],
      "order-abc",
      "tenant-abc"
    );

    expect(subtotal).toBe(1200);
  });

  it("returns 0 when no non-voided items exist", async () => {
    const mock = makeMockClientMulti([
      { data: { location_id: "loc-1", tip_cents: 0 }, error: null }, // orders fetch
      { data: [], error: null },                                       // order_items (empty)
      { data: [], error: null },                                       // order_discounts
      { data: { sales_tax_bps: 825 }, error: null },                  // locations
      { data: {}, error: null },                                       // orders update
    ]);

    const subtotal = await recalcOrderTotals(
      mock as unknown as Parameters<typeof recalcOrderTotals>[0],
      "order-empty",
      "tenant-abc"
    );

    expect(subtotal).toBe(0);
  });

  it("filters by order_id (neq voided) on items query", async () => {
    const mock = makeMockClientMulti([
      { data: { location_id: "loc-1", tip_cents: 0 }, error: null }, // orders fetch
      { data: [{ price_cents: 500, qty: 1, taxable: true }], error: null }, // order_items
      { data: [], error: null },                                       // order_discounts
      { data: { sales_tax_bps: 825 }, error: null },                  // locations
      { data: {}, error: null },                                       // orders update
    ]);

    await recalcOrderTotals(
      mock as unknown as Parameters<typeof recalcOrderTotals>[0],
      "order-xyz",
      "tenant-xyz"
    );

    // Second from() call (index 1) should be order_items with correct filters
    expect(mock.from).toHaveBeenCalledWith("order_items");
    expect(mock._chains[1]!.eq).toHaveBeenCalledWith("order_id", "order-xyz");
    expect(mock._chains[1]!.neq).toHaveBeenCalledWith("status", "voided");
  });
});

describe("assertTenantOwns", () => {
  it("returns true when row exists with matching tenant_id", async () => {
    const mock = makeMockClient({ data: { id: "row-1" }, error: null });
    const result = await assertTenantOwns(
      mock as unknown as Parameters<typeof assertTenantOwns>[0],
      "menu_items",
      "row-1",
      "tenant-abc"
    );
    expect(result).toBe(true);
  });

  it("returns false when row not found (data is null)", async () => {
    const mock = makeMockClient({ data: null, error: null });
    const result = await assertTenantOwns(
      mock as unknown as Parameters<typeof assertTenantOwns>[0],
      "menu_items",
      "missing-id",
      "tenant-abc"
    );
    expect(result).toBe(false);
  });

  it("throws when DB returns an error", async () => {
    const mock = makeMockClient({ data: null, error: { message: "DB down" } });
    await expect(
      assertTenantOwns(
        mock as unknown as Parameters<typeof assertTenantOwns>[0],
        "menu_items",
        "any-id",
        "tenant-abc"
      )
    ).rejects.toMatchObject({ message: "DB down" });
  });
});

// ---------------------------------------------------------------------------
// calculateExpectedCash — pure function, always testable
// ---------------------------------------------------------------------------
describe("calculateExpectedCash", () => {
  it("returns opening float when there are no events", () => {
    expect(calculateExpectedCash(10000, [])).toBe(10000);
  });

  it("adds cash_sale events to opening float", () => {
    const events = [
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
    ];
    // $100 float + 3 × $4.50 = $113.50
    expect(calculateExpectedCash(10000, events)).toBe(11350);
  });

  it("subtracts cash_refund events", () => {
    const events = [
      { type: "cash_sale", amount_cents: 1000 },
      { type: "cash_refund", amount_cents: 300 },
    ];
    // $100 float + $10 sale - $3 refund = $107
    expect(calculateExpectedCash(10000, events)).toBe(10700);
  });

  it("adds pay_in events", () => {
    const events = [{ type: "pay_in", amount_cents: 5000 }];
    // $100 float + $50 pay_in = $150
    expect(calculateExpectedCash(10000, events)).toBe(15000);
  });

  it("subtracts pay_out events", () => {
    const events = [{ type: "pay_out", amount_cents: 200 }];
    // $100 float - $2 pay_out = $98
    expect(calculateExpectedCash(10000, events)).toBe(9800);
  });

  it("no_sale events have no effect on expected cash", () => {
    const events = [{ type: "no_sale", amount_cents: 0 }];
    expect(calculateExpectedCash(10000, events)).toBe(10000);
  });

  it("produces the scenario from the spec: float=$100, 3×cash_sale $4.50, pay_out $2.00 → expected $111.50", () => {
    const events = [
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
      { type: "pay_out", amount_cents: 200 },
    ];
    // $100 + $13.50 - $2 = $111.50
    expect(calculateExpectedCash(10000, events)).toBe(11150);
  });

  it("variance scenario: actual $109.50 → variance = -200 cents (short)", () => {
    const events = [
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
      { type: "cash_sale", amount_cents: 450 },
      { type: "pay_out", amount_cents: 200 },
    ];
    const expected = calculateExpectedCash(10000, events); // 11150
    const closingActual = 10950;
    const variance = closingActual - expected; // -200
    expect(variance).toBe(-200);
  });

  it("can produce a positive variance (over)", () => {
    const events = [{ type: "cash_sale", amount_cents: 500 }];
    const expected = calculateExpectedCash(10000, events); // 10500
    const closingActual = 10600;
    const variance = closingActual - expected; // +100
    expect(variance).toBe(100);
  });

  it("handles only refunds (edge: drawer goes below float)", () => {
    const events = [{ type: "cash_refund", amount_cents: 15000 }];
    // $100 float - $150 refund = -$50 (negative expected is valid)
    expect(calculateExpectedCash(10000, events)).toBe(-5000);
  });

  it("handles zero opening float", () => {
    const events = [{ type: "cash_sale", amount_cents: 750 }];
    expect(calculateExpectedCash(0, events)).toBe(750);
  });
});
