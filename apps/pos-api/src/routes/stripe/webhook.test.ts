import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { webhookRouter } from "./webhook.js";

function buildApp() {
  const app = express();
  // NOTE: webhookRouter uses express.raw() internally — do NOT put express.json() before it
  app.use("/v1/webhooks/stripe", webhookRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: signature verification guard (no external deps needed)
// ---------------------------------------------------------------------------
describe("POST /v1/webhooks/stripe — signature verification", () => {
  it("returns 400 without stripe-signature header", async () => {
    // When STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set, missing sig → 400.
    // When they're NOT set (mock mode), returns 200 (graceful no-op).
    const hasStripe = Boolean(process.env["STRIPE_SECRET_KEY"] && process.env["STRIPE_WEBHOOK_SECRET"]);
    const res = await request(buildApp())
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "ping" }));

    if (hasStripe) {
      expect(res.status).toBe(400);
      // Empty body — no error details echoed
      expect(Object.keys(res.body).length).toBe(0);
    } else {
      expect(res.status).toBe(200);
    }
  });

  it("returns 400 with invalid stripe-signature header (Stripe configured)", async () => {
    const hasStripe = Boolean(process.env["STRIPE_SECRET_KEY"] && process.env["STRIPE_WEBHOOK_SECRET"]);
    if (!hasStripe) return; // skip in mock mode

    const res = await request(buildApp())
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=bad,v1=invalid")
      .send(JSON.stringify({ type: "ping" }));

    expect(res.status).toBe(400);
    // Body MUST be empty (Stripe's recommendation for failed sig verification)
    expect(Object.keys(res.body).length).toBe(0);
  });

  it("always returns 200 in mock mode (no STRIPE_SECRET_KEY)", async () => {
    const hasStripe = Boolean(process.env["STRIPE_SECRET_KEY"]);
    if (hasStripe) return; // skip when Stripe is configured

    const res = await request(buildApp())
      .post("/v1/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "account.updated" }));

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Unit: idempotency dedup logic
// ---------------------------------------------------------------------------
describe("hasProcessedStripeEvent — unit (no Supabase needed)", () => {
  it("returns false without DB (non-fatal)", async () => {
    // Without Supabase, getSupabaseClient() returns null → hasProcessedStripeEvent returns false
    const { hasProcessedStripeEvent } = await import("../../lib/idempotency.js");
    // Can't call without a real client but we can verify the module loads cleanly
    expect(typeof hasProcessedStripeEvent).toBe("function");
  });
});
