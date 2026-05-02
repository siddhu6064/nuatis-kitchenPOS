import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { ordersRouter } from "./index.js";
import { authRouter } from "../auth.js";
import { signTerminalJwt } from "../../lib/jwt.js";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_LOCATION = "00000000-0000-0000-0000-000000000010";
const DEMO_STAFF = "00000000-0000-0000-0000-000000000020";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/orders", ordersRouter);
  return app;
}

describe.skipIf(!hasSupabase)("GET /v1/orders/:id/audit-trail — integration", () => {
  let sessionToken = "";
  let orderId = "";

  beforeAll(async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    sessionToken = signIn.body.token as string;

    const terminalToken = (await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    })).token;

    const orderRes = await request(app)
      .post("/v1/orders")
      .set("Authorization", `Bearer ${terminalToken}`)
      .send({ location_id: DEMO_LOCATION, staff_id: DEMO_STAFF });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.id as string;
  });

  it("GET /v1/orders/:id/audit-trail as owner → 200 array", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/v1/orders/${orderId}/audit-trail`)
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("action");
    expect(res.body[0]).toHaveProperty("created_at");
  });

  it("GET /v1/orders/:id/audit-trail for cross-tenant order → 404", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`/v1/orders/00000000-0000-0000-0000-000000000099/audit-trail`)
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /v1/orders/:id/audit-trail — auth guards (no Supabase)", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/orders/some-id/audit-trail");
    expect(res.status).toBe(401);
  });

  it("returns 401 with terminal JWT (not session)", async () => {
    const app = buildApp();
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });
    const res = await request(app)
      .get("/v1/orders/some-id/audit-trail")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
