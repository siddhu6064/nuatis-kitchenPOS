import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { staffRouter } from "./staff.js";
import { authRouter } from "../auth.js";
import { signTerminalJwt } from "../../lib/jwt.js";
import { InviteStaffRequestSchema } from "@nuatis/pos-shared";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_LOCATION = "00000000-0000-0000-0000-000000000010";
const DEMO_STAFF = "00000000-0000-0000-0000-000000000020";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/staff", staffRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: schema validation (always run)
// ---------------------------------------------------------------------------
describe("InviteStaffRequestSchema — unit validation", () => {
  it("accepts valid cashier invite with PIN", () => {
    const result = InviteStaffRequestSchema.safeParse({
      full_name: "Alice Barista",
      email: "alice@example.com",
      role: "cashier",
      pin: "1234",
      location_ids: ["00000000-0000-0000-0000-000000000010"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects PIN with non-digits", () => {
    const result = InviteStaffRequestSchema.safeParse({
      full_name: "Bob",
      role: "cashier",
      pin: "12ab",
      location_ids: ["00000000-0000-0000-0000-000000000010"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects PIN shorter than 4 digits", () => {
    const result = InviteStaffRequestSchema.safeParse({
      full_name: "Bob",
      role: "cashier",
      pin: "123",
      location_ids: ["00000000-0000-0000-0000-000000000010"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts manager without PIN", () => {
    const result = InviteStaffRequestSchema.safeParse({
      full_name: "Carol Manager",
      email: "carol@example.com",
      role: "manager",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit: auth guards (no Supabase needed)
// ---------------------------------------------------------------------------
describe("GET /v1/staff — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).get("/v1/staff");
    expect(res.status).toBe(401);
  });

  it("returns 401 with terminal JWT (session kind required)", async () => {
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });

    const res = await request(buildApp())
      .get("/v1/staff")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/staff — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).post("/v1/staff").send({ full_name: "T", role: "cashier" });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /v1/staff/:id — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).patch("/v1/staff/fake-id").send({ active: false });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /v1/staff/:id — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).delete("/v1/staff/fake-id");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration: full CRUD (Supabase required)
// ---------------------------------------------------------------------------
describe.skipIf(!hasSupabase)("Staff CRUD — integration", () => {
  let sessionToken = "";
  let createdStaffId = "";

  beforeAll(async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    sessionToken = signIn.body.token as string;
  });

  it("GET /v1/staff as owner → 200 array", async () => {
    const res = await request(buildApp())
      .get("/v1/staff")
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("has_pin");
    expect(res.body[0]).not.toHaveProperty("pin_hash");
    expect(res.body[0]).not.toHaveProperty("password_hash");
  });

  it("POST /v1/staff → 201 with new cashier", async () => {
    const res = await request(buildApp())
      .post("/v1/staff")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ full_name: "Test Cashier", email: "testcashier@democafe.test", role: "cashier", pin: "9999" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("cashier");
    expect(res.body.has_pin).toBe(true);
    expect(res.body).not.toHaveProperty("pin_hash");
    createdStaffId = res.body.id as string;
  });

  it("PATCH /v1/staff/:id → 200 updated name", async () => {
    const res = await request(buildApp())
      .patch(`/v1/staff/${createdStaffId}`)
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ full_name: "Updated Cashier" });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe("Updated Cashier");
  });

  it("DELETE /v1/staff/:id → 204 deactivated", async () => {
    const res = await request(buildApp())
      .delete(`/v1/staff/${createdStaffId}`)
      .set("Authorization", `Bearer ${sessionToken}`);
    expect(res.status).toBe(204);
  });
});
