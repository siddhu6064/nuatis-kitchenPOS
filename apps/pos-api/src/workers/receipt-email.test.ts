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

function makeMockDb(overrides: Record<string, unknown> = {}) {
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockSelect = vi.fn().mockReturnThis();
  const mockInsert = vi.fn().mockReturnThis();
  const mockNeq = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();

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
  const DEMO_ITEMS = [
    { name_snapshot: "Latte", qty: 2, price_cents: 500 },
  ];
  const DEMO_MSG = { id: 99 };

  // Track which table is being queried
  let currentTable = "";

  const fromFn = vi.fn().mockImplementation((table: string) => {
    currentTable = table;
    return {
      select: mockSelect,
      insert: mockInsert,
      update: (_data: unknown) => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      eq: mockEq,
      neq: mockNeq,
      single: () => {
        if (currentTable === "orders") return Promise.resolve({ data: DEMO_ORDER, error: null });
        if (currentTable === "tenants") return Promise.resolve({ data: DEMO_TENANT, error: null });
        if (currentTable === "email_messages") return Promise.resolve({ data: DEMO_MSG, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => {
        if (currentTable === "locations") return Promise.resolve({ data: DEMO_LOCATION, error: null });
        if (currentTable === "payments") return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      ...overrides,
    };
  });

  // For order_items: the chain is .from().select().eq().neq() → array
  mockSelect.mockImplementation(function () {
    return {
      eq: () => ({
        neq: () => Promise.resolve({ data: DEMO_ITEMS, error: null }),
        single: () => {
          if (currentTable === "orders") return Promise.resolve({ data: DEMO_ORDER, error: null });
          if (currentTable === "tenants") return Promise.resolve({ data: DEMO_TENANT, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: () => {
          if (currentTable === "locations") return Promise.resolve({ data: DEMO_LOCATION, error: null });
          if (currentTable === "payments") return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        eq: () => ({
          maybeSingle: () => {
            if (currentTable === "payments") return Promise.resolve({ data: { method: "card_mock" }, error: null });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
      single: () => Promise.resolve({ data: null, error: null }),
    };
  });

  // For insert: returns { select: fn that returns { single: fn } }
  mockInsert.mockImplementation(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: DEMO_MSG, error: null }),
    }),
  }));

  return { from: fromFn };
}

vi.mock("../lib/supabase.js", () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from "../lib/supabase.js";
import { processReceiptEmail } from "./receipt-email.js";

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
