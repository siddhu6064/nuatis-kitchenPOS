import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { authRouter } from "./auth.js";
import { requireAuth } from "../middleware/auth.js";
import { signSessionJwt } from "../lib/jwt.js";

// Integration tests require a live Supabase connection — skip when not configured
const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.get("/v1/protected", requireAuth({ kinds: ["session"] }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe.skipIf(!hasSupabase)("POST /v1/auth/sign-in — integration", () => {
  it("returns 200 + session JWT for seeded demo owner", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("expires_at");
    expect(res.body.user.role).toBe("owner");
  });

  it("returns 401 for wrong password", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasSupabase)("POST /v1/auth/pin — integration", () => {
  it("returns 200 + terminal JWT for seeded PIN 1234", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/auth/pin")
      .send({
        tenant_id: "00000000-0000-0000-0000-000000000001",
        location_id: "00000000-0000-0000-0000-000000000010",
        pin: "1234",
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.staff.role).toBe("cashier");
  });

  it("returns 401 for wrong PIN", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/auth/pin")
      .send({
        tenant_id: "00000000-0000-0000-0000-000000000001",
        location_id: "00000000-0000-0000-0000-000000000010",
        pin: "0000",
      });
    expect(res.status).toBe(401);
  });
});

describe("requireAuth middleware — unit", () => {
  it("accepts a valid session JWT in Authorization header", async () => {
    const { token } = await signSessionJwt({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000020",
      role: "owner",
    });
    const app = buildApp();
    const res = await request(app)
      .get("/v1/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("rejects a missing Authorization header with 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/protected");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token with 401", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/v1/protected")
      .set("Authorization", "Bearer not.a.real.token");
    expect(res.status).toBe(401);
  });
});
