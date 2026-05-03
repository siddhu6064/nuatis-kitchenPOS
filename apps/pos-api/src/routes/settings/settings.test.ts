import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { settingsRouter } from "./index.js";
import { authRouter } from "../auth.js";
import { TenantSettingsSchema, UpdateTenantSettingsRequestSchema } from "@nuatis/pos-shared";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/settings", settingsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: schema validation (always run)
// ---------------------------------------------------------------------------
describe("TenantSettingsSchema — unit validation", () => {
  it("accepts valid tenant settings", () => {
    const result = TenantSettingsSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Cafe",
      vertical: "cafe",
      timezone: "America/Chicago",
      email_daily_report: true,
      daily_report_recipient_email: "owner@democafe.test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown timezone", () => {
    const result = TenantSettingsSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Cafe",
      vertical: "cafe",
      timezone: "Europe/London",
      email_daily_report: false,
      daily_report_recipient_email: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateTenantSettingsRequestSchema — sales_tax_bps clamped via LocationSettingsSchema", () => {
  it("sales_tax_bps=2001 rejected by LocationSettingsSchema", async () => {
    const { UpdateLocationSettingsRequestSchema } = await import("@nuatis/pos-shared");
    const result = UpdateLocationSettingsRequestSchema.safeParse({ sales_tax_bps: 2001 });
    expect(result.success).toBe(false);
  });

  it("sales_tax_bps=825 accepted", async () => {
    const { UpdateLocationSettingsRequestSchema } = await import("@nuatis/pos-shared");
    const result = UpdateLocationSettingsRequestSchema.safeParse({ sales_tax_bps: 825 });
    expect(result.success).toBe(true);
  });

  it("rejects partial tenant update with bad timezone", () => {
    const result = UpdateTenantSettingsRequestSchema.safeParse({ timezone: "Europe/Paris" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: auth guards (no Supabase needed)
// ---------------------------------------------------------------------------
describe("GET /v1/settings — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).get("/v1/settings");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /v1/settings/tenant — owner only", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).patch("/v1/settings/tenant").send({ name: "x" });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration (Supabase required)
// ---------------------------------------------------------------------------
describe.skipIf(!hasSupabase)("GET /v1/settings — integration", () => {
  it("returns tenant + locations for owner", async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    const token = signIn.body.token as string;

    const res = await request(app)
      .get("/v1/settings")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tenant");
    expect(res.body).toHaveProperty("locations");
    expect(res.body.tenant).toHaveProperty("name");
    expect(res.body.tenant).toHaveProperty("timezone");
    expect(Array.isArray(res.body.locations)).toBe(true);
  });
});
