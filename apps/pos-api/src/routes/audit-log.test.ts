import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { auditLogRouter, auditLogCsvRouter } from "./audit-log.js";
import { signSessionJwt } from "../lib/jwt.js";

const hasSupabase = Boolean(
  process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]
);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_USER = "00000000-0000-0000-0000-000000000099";

async function makeToken(role: "owner" | "manager"): Promise<string> {
  const { token } = await signSessionJwt({
    tenant_id: DEMO_TENANT,
    user_id: DEMO_USER,
    role,
  });
  return token;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  // Mirror the index.ts mount order — csv BEFORE the base path
  app.use("/v1/audit-log.csv", auditLogCsvRouter);
  app.use("/v1/audit-log", auditLogRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Auth guard tests — no Supabase required (JWT is verified locally via
// POS_JWT_SECRET set in vitest env).
// ---------------------------------------------------------------------------

describe("GET /v1/audit-log — auth guards (no Supabase)", () => {
  it("returns 401 without authorization header", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/audit-log");
    expect(res.status).toBe(401);
  });

  it("returns 503 (not 403) for owner when DB not configured", async () => {
    if (hasSupabase) return; // only meaningful in mock mode
    const app = buildApp();
    const token = await makeToken("owner");
    const res = await request(app)
      .get("/v1/audit-log")
      .set("Authorization", `Bearer ${token}`);
    // Owner is allowed — but no Supabase → 503
    expect(res.status).toBe(503);
  });

  it("returns 503 (not 403) for manager when DB not configured", async () => {
    if (hasSupabase) return;
    const app = buildApp();
    const token = await makeToken("manager");
    const res = await request(app)
      .get("/v1/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// CSV role-guard tests — only role check happens before Supabase query
// ---------------------------------------------------------------------------

describe("GET /v1/audit-log.csv — role guard (no Supabase required)", () => {
  it("returns 401 without authorization header", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/audit-log.csv");
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as manager", async () => {
    const app = buildApp();
    const token = await makeToken("manager");
    const res = await request(app)
      .get("/v1/audit-log.csv")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe("forbidden");
  });

  it("returns 503 (not 403) for owner when DB not configured", async () => {
    if (hasSupabase) return;
    const app = buildApp();
    const token = await makeToken("owner");
    const res = await request(app)
      .get("/v1/audit-log.csv")
      .set("Authorization", `Bearer ${token}`);
    // Owner is allowed — but no Supabase → 503
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require Supabase
// ---------------------------------------------------------------------------

describe.skipIf(!hasSupabase)("GET /v1/audit-log — pagination (integration)", () => {
  it("returns { entries, next_cursor, distinct_action_types } shape", async () => {
    const app = buildApp();
    const token = await makeToken("owner");
    const res = await request(app)
      .get("/v1/audit-log?limit=50")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect("next_cursor" in res.body).toBe(true);
    expect(Array.isArray(res.body.distinct_action_types)).toBe(true);
  });

  it("respects action_type filter", async () => {
    const app = buildApp();
    const token = await makeToken("owner");
    const res = await request(app)
      .get("/v1/audit-log?action_type=staff_sign_in&limit=50")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entries = res.body.entries as Array<{ action_type: string }>;
    for (const e of entries) {
      expect(e.action_type).toBe("staff_sign_in");
    }
  });
});
