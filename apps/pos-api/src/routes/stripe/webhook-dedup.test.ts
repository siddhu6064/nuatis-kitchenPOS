/**
 * Webhook dedup tests — isolated from webhook.test.ts so vi.mock hoisting
 * does not interfere with the signature-only tests there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock modules — vi.mock is hoisted to the top of the file by Vitest
// ---------------------------------------------------------------------------

vi.mock("../../env.js", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
    STRIPE_SECRET_KEY: "sk_test_123",
    PORT: 3002,
    NODE_ENV: "test",
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    CORS_ALLOWED_ORIGINS: undefined,
    STRIPE_CONNECT_REFRESH_URL: undefined,
    STRIPE_CONNECT_RETURN_URL: undefined,
  },
}));

// Mock Stripe so constructEvent always succeeds with a fixed event ID
vi.mock("../../lib/stripe.js", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (_body: Buffer, _sig: string, _secret: string) => ({
        id: "evt_dedup_test_001",
        type: "account.updated",
        data: {
          object: {
            id: "acct_test_001",
            charges_enabled: false,
            payouts_enabled: false,
            requirements: { currently_due: [] },
          },
        },
      }),
    },
  }),
  createConnectionToken: vi.fn(),
  listTerminalReaders: vi.fn(),
  createPaymentIntent: vi.fn(),
  refundPaymentIntent: vi.fn(),
}));

// Supabase mock — supports the fluent query builder chain
vi.mock("../../lib/supabase.js", () => {
  function makeChain(value: unknown): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    c["from"] = () => makeChain(value);
    c["select"] = () => makeChain(value);
    c["update"] = () => makeChain({ data: null, error: null });
    c["insert"] = () => makeChain({ data: null, error: null });
    c["eq"] = () => makeChain(value);
    c["limit"] = () => makeChain(value);
    c["maybeSingle"] = async () =>
      ({ data: { id: "tenant_1", stripe_account_id: "acct_test_001", stripe_charges_enabled: false, stripe_payouts_enabled: false }, error: null });
    c["single"] = async () => ({ data: null, error: null });
    c["channel"] = () => ({ send: () => Promise.resolve() });
    return c;
  }
  return { getSupabaseClient: () => makeChain(null) };
});

const mockMarkStripeEventProcessed = vi.fn();
let hasProcessedCallCount = 0;

vi.mock("../../lib/idempotency.js", () => ({
  hasProcessedStripeEvent: async (_client: unknown, _eventId: string) => {
    hasProcessedCallCount++;
    // First call: not yet processed. Second and beyond: already processed.
    return hasProcessedCallCount > 1;
  },
  markStripeEventProcessed: (...args: unknown[]) => mockMarkStripeEventProcessed(...args),
}));

vi.mock("../../lib/db.js", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks are registered
import { webhookRouter } from "./webhook.js";

function buildApp() {
  const app = express();
  app.use("/v1/webhooks/stripe", webhookRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Dedup test suite
// ---------------------------------------------------------------------------
describe("POST /v1/webhooks/stripe — event.id dedup", () => {
  beforeEach(() => {
    hasProcessedCallCount = 0;
    mockMarkStripeEventProcessed.mockClear();
  });

  it("returns 200 on both sends and marks event processed only once", async () => {
    const app = buildApp();
    const body = JSON.stringify({ type: "account.updated" });
    const sig = "t=1234,v1=mock_signature";

    // First delivery — hasProcessed returns false, handler runs
    const res1 = await request(app)
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sig)
      .send(body);

    expect(res1.status).toBe(200);

    // Second delivery of same event.id — hasProcessed returns true, skip
    const res2 = await request(app)
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sig)
      .send(body);

    expect(res2.status).toBe(200);

    // hasProcessedStripeEvent called twice (once per request)
    expect(hasProcessedCallCount).toBe(2);

    // markStripeEventProcessed called exactly once (on first delivery only)
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledTimes(1);
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith(
      expect.anything(),        // client
      "evt_dedup_test_001",     // eventId — same both times
      "account.updated",        // eventType
      expect.any(String),       // tenantId
      expect.any(Object)        // payload
    );
  });

  it("skips handler on duplicate without calling markStripeEventProcessed again", async () => {
    const app = buildApp();
    const body = JSON.stringify({ id: "evt_dedup_test_001", type: "account.updated" });
    const sig = "t=9999,v1=mock_sig_2";

    // Simulate already-processed state from the start
    hasProcessedCallCount = 1; // forces hasProcessed to return true immediately

    const res = await request(app)
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    // No mark call — event was already processed
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });
});
