import { describe, it, expect, vi } from "vitest";
import { tenantSelect, assertTenantOwns } from "./db.js";

// ---------------------------------------------------------------------------
// Mock a minimal Supabase client
// ---------------------------------------------------------------------------
function makeMockClient(resolveWith: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolveWith),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
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
