import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../env.js", () => ({
  env: {
    POS_JWT_SECRET: "test-jwt-secret-that-is-at-least-32-chars-long!!",
    RECEIPT_TOKEN_SECRET: undefined,
    RESEND_API_KEY: undefined,
    UPSTASH_REDIS_URL: undefined,
    RECEIPT_BASE_URL: "http://localhost:3002",
    NODE_ENV: "test",
  },
}));

// Mock email sender
const mockSendReceiptEmail = vi.fn().mockResolvedValue({ id: "resend-abc123" });
vi.mock("../lib/email.js", () => ({
  sendReceiptEmail: (...args: unknown[]) => mockSendReceiptEmail(...args),
}));

// Mock Supabase client
const mockUpdate = vi.fn().mockReturnThis();
const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });

const DEMO_ORDER = {
  id: "order-111",
  order_number: 42,
  tenant_id: "tenant-222",
  location_id: "loc-333",
  status: "paid",
  opened_at: "2026-05-02T10:00:00Z",
  closed_at: "2026-05-02T10:05:00Z",
  subtotal_cents: 1000,
  tax_cents: 82,
  tip_cents: 150,
  total_cents: 1232,
};

const DEMO_TENANT = { name: "Blue Bottle Coffee" };
const DEMO_LOCATION = { name: "Main St", address: { street: "123 Main St", city: "Austin" } };
const DEMO_ITEMS = [{ name_snapshot: "Latte", qty: 2, price_cents: 500 }];
const DEMO_MSG = { id: 99 };

/**
 * Build a mock Supabase-like client.
 * Each from() call captures its table in a closure so concurrent Promise.all
 * calls don't clobber a shared variable.
 */
function makeMockDb() {
  const fromFn = vi.fn().mockImplementation((table: string) => {
    // Resolve a terminal value for the given table
    const resolveData = (method: "single" | "maybeSingle" | "array") => {
      if (table === "orders")         return method === "single"      ? { data: DEMO_ORDER,    error: null } : { data: DEMO_ORDER,    error: null };
      if (table === "tenants")        return method === "single"      ? { data: DEMO_TENANT,   error: null } : { data: DEMO_TENANT,   error: null };
      if (table === "locations")      return { data: DEMO_LOCATION, error: null };
      if (table === "payments")       return { data: null,           error: null };
      if (table === "order_items")    return method === "array"       ? { data: DEMO_ITEMS,    error: null } : { data: null, error: null };
      if (table === "order_discounts")return { data: [],             error: null };
      if (table === "email_messages") return { data: DEMO_MSG,       error: null };
      return { data: null, error: null };
    };

    // Chain builder — each method returns a new object with all chain methods
    const chain = (): Record<string, unknown> => ({
      select: vi.fn().mockImplementation(() => chain()),
      eq:     vi.fn().mockImplementation(() => chain()),
      neq:    vi.fn().mockImplementation(() => Promise.resolve(resolveData("array"))),
      is:     vi.fn().mockImplementation(() => Promise.resolve(resolveData("array"))),
      single:      vi.fn().mockImplementation(() => Promise.resolve(resolveData("single"))),
      maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(resolveData("maybeSingle"))),
    });

    return {
      ...chain(),
      insert: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(resolveData("single")),
      })),
      update: vi.fn().mockImplementation((_data: unknown) => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    };
  });

  return { from: fromFn };
}

vi.mock("../lib/supabase.js", () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from "../lib/supabase.js";
import { processReceiptEmail, renderReceiptHtml, renderReceiptText } from "./receipt-email.js";

describe("processReceiptEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendReceiptEmail.mockResolvedValue({ id: "resend-abc123" });
  });

  const JOB_DATA = {
    tenant_id: "tenant-222",
    order_id: "order-111",
    to: "customer@example.com",
    receipt_url: "http://localhost:3002/r/some-token",
  };

  it("returns early (no throw) when Supabase is not configured", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    await expect(processReceiptEmail(JOB_DATA)).resolves.toBeUndefined();
    expect(mockSendReceiptEmail).not.toHaveBeenCalled();
  });

  it("calls sendReceiptEmail with correct to/subject args", async () => {
    const mockDb = makeMockDb();
    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    await processReceiptEmail(JOB_DATA);

    expect(mockSendReceiptEmail).toHaveBeenCalledOnce();
    const [args] = mockSendReceiptEmail.mock.calls[0] as [{ to: string; subject: string; html: string; text: string }];
    expect(args.to).toBe("customer@example.com");
    expect(args.subject).toMatch(/Blue Bottle Coffee/);
    expect(args.subject).toMatch(/#42/);
    expect(args.html).toContain("Blue Bottle Coffee");
    expect(args.html).toContain("Latte");
    expect(args.text).toContain("http://localhost:3002/r/some-token");
  });

  it("updates email_messages status to 'sent' on success", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockDb = makeMockDb();
    // Override update to track calls
    const originalFrom = mockDb.from;
    let updateCallData: unknown = null;
    mockDb.from = vi.fn().mockImplementation((table: string) => {
      const res = originalFrom(table);
      res.update = (data: unknown) => {
        updateCallData = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      };
      return res;
    });

    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    await processReceiptEmail(JOB_DATA);

    // The last update call should set status='sent'
    expect(updateCallData).toMatchObject({ status: "sent", provider_message_id: "resend-abc123" });
  });

  it("updates email_messages status to 'failed' when sendReceiptEmail throws", async () => {
    mockSendReceiptEmail.mockRejectedValueOnce(new Error("Resend rate limit"));

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockDb = makeMockDb();
    let lastUpdateData: unknown = null;
    const originalFrom = mockDb.from;
    mockDb.from = vi.fn().mockImplementation((table: string) => {
      const res = originalFrom(table);
      res.update = (data: unknown) => {
        lastUpdateData = data;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      };
      return res;
    });

    vi.mocked(getSupabaseClient).mockReturnValue(mockDb as unknown as ReturnType<typeof getSupabaseClient>);

    await expect(processReceiptEmail(JOB_DATA)).rejects.toThrow("Resend rate limit");
    expect(lastUpdateData).toMatchObject({ status: "failed" });
    expect((lastUpdateData as { error: string }).error).toMatch(/Resend rate limit/);
  });
});

// ---------------------------------------------------------------------------
// Pure renderer tests — no DB or BullMQ needed
// ---------------------------------------------------------------------------

const RENDER_ORDER: Record<string, unknown> = {
  id: "order-111",
  order_number: 42,
  subtotal_cents: 2000,
  tax_cents: 148,
  tip_cents: 0,
  total_cents: 1948,
  closed_at: "2026-05-02T10:05:00Z",
};

const RENDER_ITEMS = [{ name_snapshot: "Cold Brew", qty: 2, price_cents: 1000 }];
const RENDER_TENANT = { name: "Blue Bottle Coffee" };
const RENDER_RECEIPT_URL = "http://localhost:3002/r/some-token";

describe("renderReceiptHtml — discount lines", () => {
  it("renders a Discount row with reason and negative amount for each non-voided discount", () => {
    const html = renderReceiptHtml({
      order: RENDER_ORDER,
      items: RENDER_ITEMS,
      discounts: [{ reason: "employee comp", applied_amount_cents: 200 }],
      tenant: RENDER_TENANT,
      location: null,
      payment: null,
      receipt_url: RENDER_RECEIPT_URL,
    });

    expect(html).toContain("Discount");
    expect(html).toContain("employee comp");
    expect(html).toContain("−$2.00");
  });

  it("renders multiple discount rows in order", () => {
    const html = renderReceiptHtml({
      order: RENDER_ORDER,
      items: RENDER_ITEMS,
      discounts: [
        { reason: "happy hour", applied_amount_cents: 100 },
        { reason: "manager override", applied_amount_cents: 300 },
      ],
      tenant: RENDER_TENANT,
      location: null,
      payment: null,
      receipt_url: RENDER_RECEIPT_URL,
    });

    expect(html).toContain("happy hour");
    expect(html).toContain("−$1.00");
    expect(html).toContain("manager override");
    expect(html).toContain("−$3.00");
  });

  it("omits Discount rows when discounts array is empty", () => {
    const html = renderReceiptHtml({
      order: RENDER_ORDER,
      items: RENDER_ITEMS,
      discounts: [],
      tenant: RENDER_TENANT,
      location: null,
      payment: null,
      receipt_url: RENDER_RECEIPT_URL,
    });

    expect(html).not.toContain("Discount");
    expect(html).not.toContain("−$");
  });
});

describe("renderReceiptText — discount lines", () => {
  it("includes Discount parenthetical line for non-voided discounts", () => {
    const text = renderReceiptText({
      order: RENDER_ORDER,
      items: RENDER_ITEMS,
      discounts: [{ reason: "employee comp", applied_amount_cents: 200 }],
      tenant: RENDER_TENANT,
      receipt_url: RENDER_RECEIPT_URL,
    });

    expect(text).toContain("Discount");
    expect(text).toContain("employee comp");
    expect(text).toContain("-$2.00");
  });

  it("omits discount lines when no discounts", () => {
    const text = renderReceiptText({
      order: RENDER_ORDER,
      items: RENDER_ITEMS,
      discounts: [],
      tenant: RENDER_TENANT,
      receipt_url: RENDER_RECEIPT_URL,
    });

    expect(text).not.toContain("Discount");
  });
});
