import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Integration tests skip gracefully when Supabase is not configured.
// Unit tests (auth guards, manager-pin middleware) always run.
// ---------------------------------------------------------------------------
const SUPABASE_CONFIGURED = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

// ---------------------------------------------------------------------------
// Helpers: build a minimal test app wired with the cash router + auth
// ---------------------------------------------------------------------------
async function buildApp() {
  const { default: expressLib } = await import("express");
  const { cashRouter } = await import("./index.js");
  const { requireAuth } = await import("../../middleware/auth.js");

  const app = expressLib();
  app.use(expressLib.json());
  app.use("/v1/cash", cashRouter);
  return { app, requireAuth };
}

// ---------------------------------------------------------------------------
// Unit: requireManagerPin middleware — no Supabase needed
// ---------------------------------------------------------------------------
describe("requireManagerPin middleware — unit", () => {
  it("returns 403 manager_pin_required when manager_pin is absent", async () => {
    const app = express();
    app.use(express.json());

    // Mount a dummy route that requires manager PIN
    // We need to fake req.auth for the middleware to work
    const { requireManagerPin } = await import("../../middleware/manager-pin.js");
    app.post("/test", (req, res, next) => {
      req.auth = {
        kind: "terminal",
        tenant_id: "00000000-0000-0000-0000-000000000001",
        location_id: "00000000-0000-0000-0000-000000000010",
        staff_id: "00000000-0000-0000-0000-000000000020",
        role: "cashier",
        iat: 0,
        exp: 9999999999,
      };
      next();
    }, requireManagerPin(), (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).post("/test").send({ type: "pay_out", amount_cents: 500 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });

  it("returns 503 when Supabase is not configured and manager_pin is present", async () => {
    const app = express();
    app.use(express.json());

    const { requireManagerPin } = await import("../../middleware/manager-pin.js");
    app.post("/test", (req, _res, next) => {
      req.auth = {
        kind: "terminal",
        tenant_id: "00000000-0000-0000-0000-000000000001",
        location_id: "00000000-0000-0000-0000-000000000010",
        staff_id: "00000000-0000-0000-0000-000000000020",
        role: "cashier",
        iat: 0,
        exp: 9999999999,
      };
      next();
    }, requireManagerPin(), (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).post("/test").send({ manager_pin: "1234" });
    // Without Supabase: 503. With Supabase: 403 invalid (pin won't match test data)
    expect([403, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Unit: cash session auth guards — no Supabase needed
// ---------------------------------------------------------------------------
describe("Cash session auth guards — unit (no Supabase)", () => {
  it("POST /v1/cash/sessions without auth → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app).post("/v1/cash/sessions").send({ location_id: "00000000-0000-0000-0000-000000000010", opening_float_cents: 10000 });
    expect(res.status).toBe(401);
  });

  it("GET /v1/cash/sessions/current without auth → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app).get("/v1/cash/sessions/current?location_id=00000000-0000-0000-0000-000000000010");
    expect(res.status).toBe(401);
  });

  it("GET /v1/cash/sessions without auth → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app).get("/v1/cash/sessions");
    expect(res.status).toBe(401);
  });

  it("POST /v1/cash/sessions/:id/events without auth → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions/00000000-0000-0000-0000-000000000099/events")
      .send({ type: "pay_in", amount_cents: 1000 });
    expect(res.status).toBe(401);
  });

  it("POST /v1/cash/sessions/:id/close without auth → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions/00000000-0000-0000-0000-000000000099/close")
      .send({ closing_actual_cents: 10000 });
    expect(res.status).toBe(401);
  });

  it("POST /v1/cash/sessions with valid JWT but no DB → 503", async () => {
    const { signTerminalJwt } = await import("../../lib/jwt.js");
    const { token } = await signTerminalJwt({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      location_id: "00000000-0000-0000-0000-000000000010",
      staff_id: "00000000-0000-0000-0000-000000000020",
    });
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ location_id: "00000000-0000-0000-0000-000000000010", opening_float_cents: 10000 });
    expect(res.status).toBe(503);
  });

  it("POST /v1/cash/sessions/:id/events (pay_out) with valid JWT but no manager_pin → 403 manager_pin_required", async () => {
    const { signTerminalJwt } = await import("../../lib/jwt.js");
    const { token } = await signTerminalJwt({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      location_id: "00000000-0000-0000-0000-000000000010",
      staff_id: "00000000-0000-0000-0000-000000000020",
    });
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions/00000000-0000-0000-0000-000000000099/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "pay_out", amount_cents: 500 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });

  it("POST /v1/cash/sessions/:id/events (no_sale) without manager_pin → 403 manager_pin_required", async () => {
    const { signTerminalJwt } = await import("../../lib/jwt.js");
    const { token } = await signTerminalJwt({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      location_id: "00000000-0000-0000-0000-000000000010",
      staff_id: "00000000-0000-0000-0000-000000000020",
    });
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions/00000000-0000-0000-0000-000000000099/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "no_sale", amount_cents: 0 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });

  it("POST /v1/cash/sessions/:id/events (pay_in) with valid JWT but no DB → 503", async () => {
    const { signTerminalJwt } = await import("../../lib/jwt.js");
    const { token } = await signTerminalJwt({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      location_id: "00000000-0000-0000-0000-000000000010",
      staff_id: "00000000-0000-0000-0000-000000000020",
    });
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions/00000000-0000-0000-0000-000000000099/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "pay_in", amount_cents: 1000 });
    // pay_in doesn't need manager PIN → hits DB guard → 503
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — skipped gracefully when Supabase not configured
// ---------------------------------------------------------------------------
describe.skipIf(!SUPABASE_CONFIGURED)("Cash session lifecycle — integration (requires Supabase)", () => {
  const TENANT_ID = "00000000-0000-0000-0000-000000000001";
  const LOCATION_ID = "00000000-0000-0000-0000-000000000010";
  const STAFF_ID = "00000000-0000-0000-0000-000000000020";

  let terminalToken: string;
  let sessionId: string;

  beforeEach(async () => {
    const { signTerminalJwt } = await import("../../lib/jwt.js");
    const result = await signTerminalJwt({ tenant_id: TENANT_ID, location_id: LOCATION_ID, staff_id: STAFF_ID });
    terminalToken = result.token;
  });

  it("opens a new cash session with status=open", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions")
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ location_id: LOCATION_ID, opening_float_cents: 10000 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect(res.body.opening_float_cents).toBe(10000);
    expect(res.body.tenant_id).toBe(TENANT_ID);
    sessionId = res.body.id as string;
  });

  it("rejects opening a second session for the same location with 409", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions")
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ location_id: LOCATION_ID, opening_float_cents: 5000 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("logs a pay_in event successfully", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post(`/v1/cash/sessions/${sessionId}/events`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ type: "pay_in", amount_cents: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("pay_in");
    expect(res.body.amount_cents).toBe(5000);
  });

  it("rejects pay_out without manager PIN with 403 manager_pin_required", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post(`/v1/cash/sessions/${sessionId}/events`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ type: "pay_out", amount_cents: 200 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });

  it("rejects pay_out with invalid manager PIN with 403 manager_pin_invalid", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post(`/v1/cash/sessions/${sessionId}/events`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ type: "pay_out", amount_cents: 200, manager_pin: "0000" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_invalid");
  });

  it("closes session and calculates variance correctly", async () => {
    const { app } = await buildApp();

    // Log 3 cash_sale events of $4.50 each
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/v1/cash/sessions/${sessionId}/events`)
        .set("Authorization", `Bearer ${terminalToken}`)
        .send({ type: "cash_sale", amount_cents: 450 });
    }

    // Close with exact amount: $100 + $13.50 = $113.50 = 11350 cents → variance = 0
    const resZero = await request(app)
      .post(`/v1/cash/sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ closing_actual_cents: 11350 });

    expect(resZero.status).toBe(200);
    expect(resZero.body.expected_cents).toBe(11350);
    expect(resZero.body.variance_cents).toBe(0);
    expect(resZero.body.status).toBe("closed");
  });

  it("rejects closing an already-closed session with 409", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post(`/v1/cash/sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ closing_actual_cents: 11350 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("can open a new session after the previous one is closed", async () => {
    const { app } = await buildApp();
    const res = await request(app)
      .post("/v1/cash/sessions")
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ location_id: LOCATION_ID, opening_float_cents: 11350 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");

    // Clean up
    await request(app)
      .post(`/v1/cash/sessions/${res.body.id as string}/close`)
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ closing_actual_cents: 11350 });
  });
});

// Suppress unused import warning for vi
void vi;
