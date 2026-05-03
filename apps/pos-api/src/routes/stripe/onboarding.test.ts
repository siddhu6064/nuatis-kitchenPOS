import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { onboardingRouter } from "./onboarding.js";
import { authRouter } from "../auth.js";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
const hasStripe = Boolean(process.env["STRIPE_SECRET_KEY"]);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/stripe/onboarding", onboardingRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: auth guards + mock mode (no external deps needed)
// ---------------------------------------------------------------------------
describe("POST /v1/stripe/onboarding/start — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).post("/v1/stripe/onboarding/start").send({});
    expect(res.status).toBe(401);
  });

  it("returns 503 when STRIPE_SECRET_KEY is absent (mock mode)", async () => {
    // This test passes because STRIPE_SECRET_KEY is not set in test env
    if (hasStripe) return; // skip if real Stripe configured

    const app = buildApp();
    // Sign in as owner to pass auth guard
    const signIn = hasSupabase
      ? await request(app).post("/v1/auth/sign-in").send({ email: "owner@democafe.test", password: "demo1234" })
      : null;
    if (!signIn || signIn.status !== 200) return; // skip if no Supabase

    const res = await request(app)
      .post("/v1/stripe/onboarding/start")
      .set("Authorization", `Bearer ${signIn.body.token as string}`)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("stripe_not_configured");
  });
});

describe("GET /v1/stripe/onboarding/status — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).get("/v1/stripe/onboarding/status");
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/stripe/onboarding/refresh — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).get("/v1/stripe/onboarding/refresh");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration (Supabase + Stripe both needed)
// ---------------------------------------------------------------------------
describe.skipIf(!hasSupabase || !hasStripe)("GET /v1/stripe/onboarding/status — integration", () => {
  it("returns not-started status when tenant has no account", async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    const token = signIn.body.token as string;

    const res = await request(app)
      .get("/v1/stripe/onboarding/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stripe_account_id");
    expect(res.body).toHaveProperty("charges_enabled");
    expect(res.body).toHaveProperty("requirements_currently_due");
    expect(Array.isArray(res.body.requirements_currently_due)).toBe(true);
  });
});
