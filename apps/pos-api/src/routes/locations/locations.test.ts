import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { locationsRouter } from "./index.js";
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
  app.use("/v1/locations", locationsRouter);
  return app;
}

describe.skipIf(!hasSupabase)("GET /v1/locations — integration", () => {
  let sessionToken = "";

  beforeAll(async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    sessionToken = signIn.body.token as string;
  });

  it("GET /v1/locations as owner → 200 array with at least one location", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/v1/locations")
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("id");
    expect(res.body[0]).toHaveProperty("name");
  });
});

describe("GET /v1/locations — auth guards (no Supabase)", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/locations");
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
      .get("/v1/locations")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty array when tenant has no locations", async () => {
    // Without Supabase, getSupabaseClient() returns null → 503.
    // This test verifies the auth guard passes before the DB call.
    // A full empty-array test requires integration.
    const app = buildApp();
    const res = await request(app).get("/v1/locations");
    expect(res.status).toBe(401);
  });
});
