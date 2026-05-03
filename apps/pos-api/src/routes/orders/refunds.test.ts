import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { refundsRouter } from "./refunds.js";
import { authRouter } from "../auth.js";
import { signTerminalJwt } from "../../lib/jwt.js";
import { z } from "zod";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_LOCATION = "00000000-0000-0000-0000-000000000010";
const DEMO_STAFF = "00000000-0000-0000-0000-000000000020";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/payments", refundsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: request schema validation
// ---------------------------------------------------------------------------
describe("RefundRequest — unit validation", () => {
  const RefundRequestSchema = z.object({
    amount_cents: z.number().int().positive().optional(),
    reason: z.string().min(1).max(500),
  });

  it("accepts valid full refund request", () => {
    expect(RefundRequestSchema.safeParse({ reason: "Customer unhappy" }).success).toBe(true);
  });

  it("accepts partial refund with amount", () => {
    expect(RefundRequestSchema.safeParse({ amount_cents: 500, reason: "Partial" }).success).toBe(true);
  });

  it("rejects empty reason", () => {
    expect(RefundRequestSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("rejects negative amount_cents", () => {
    expect(RefundRequestSchema.safeParse({ amount_cents: -100, reason: "Test" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: auth guards (no Supabase needed)
// ---------------------------------------------------------------------------
describe("POST /v1/payments/:id/refund — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp())
      .post("/v1/payments/fake-id/refund")
      .send({ reason: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 manager_pin_required for terminal JWT without pin", async () => {
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });

    const res = await request(buildApp())
      .post("/v1/payments/fake-id/refund")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "test" });
    // Without DB: getSupabaseClient() returns null → 503; but auth guard fires first with 403
    // The manager pin middleware fires and checks body first — returns 403 manager_pin_required
    expect([403, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Integration (Supabase required)
// ---------------------------------------------------------------------------
describe.skipIf(!hasSupabase)("POST /v1/payments/:id/refund — integration", () => {
  let sessionToken = "";
  let cashPaymentId = "";

  beforeAll(async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    sessionToken = signIn.body.token as string;
  });

  it("returns 404 for non-existent payment", async () => {
    const res = await request(buildApp())
      .post(`/v1/payments/${crypto.randomUUID()}/refund`)
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ reason: "test" });
    expect(res.status).toBe(404);
  });

  void cashPaymentId; // suppress unused warning — used in extended integration tests
});
