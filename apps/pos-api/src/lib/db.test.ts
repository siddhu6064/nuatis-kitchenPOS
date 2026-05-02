import { describe, it, expect, vi } from "vitest";
import { tenantSelect, assertTenantOwns, recalcOrderTotals } from "./db.js";

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
  it("sums price_cents * qty for non-voided items and returns subtotal", async () => {
    const items = [
      { price_cents: 300, qty: 1 },  // 300
      { price_cents: 450, qty: 2 },  // 900
    ];
    // call 1: select items → returns items array
    // call 2: update orders → returns {} (ignored)
    const mock = makeMockClientMulti([
      { data: items, error: null },
      { data: {}, error: null },
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
      { data: [], error: null },
      { data: {}, error: null },
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
      { data: [{ price_cents: 500, qty: 1 }], error: null },
      { data: {}, error: null },
    ]);

    await recalcOrderTotals(
      mock as unknown as Parameters<typeof recalcOrderTotals>[0],
      "order-xyz",
      "tenant-xyz"
    );

    // First from() call should be on order_items
    expect(mock.from).toHaveBeenCalledWith("order_items");
    expect(mock._chains[0]!.eq).toHaveBeenCalledWith("order_id", "order-xyz");
    expect(mock._chains[0]!.neq).toHaveBeenCalledWith("status", "voided");
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
