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
// Seeded menu item IDs
const ESPRESSO_ID = "00000000-0000-0000-0000-000000000040"; // 300 cents
const LATTE_ID = "00000000-0000-0000-0000-000000000041";    // 450 cents

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/orders", ordersRouter);
  return app;
}

describe.skipIf(!hasSupabase)("Orders state machine — integration", () => {
  let sessionToken = "";
  let terminalToken = "";
  let orderId = "";
  let espressoItemId = "";
  let latteItemId = "";

  beforeAll(async () => {
    const app = buildApp();
    const signIn = await request(app).post("/v1/auth/sign-in").send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    sessionToken = signIn.body.token as string;

    const { token } = await signTerminalJwt({ tenant_id: DEMO_TENANT, location_id: DEMO_LOCATION, staff_id: DEMO_STAFF });
    terminalToken = token;
  });

  it("POST /v1/orders → 201 + open order", async () => {
    const app = buildApp();
    const res = await request(app).post("/v1/orders").set("Authorization", `Bearer ${terminalToken}`).send({ location_id: DEMO_LOCATION, staff_id: DEMO_STAFF });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    orderId = res.body.id as string;
  });

  it("POST /v1/orders/:id/items — add Espresso → subtotal 300", async () => {
    const app = buildApp();
    const res = await request(app).post(`/v1/orders/${orderId}/items`).set("Authorization", `Bearer ${terminalToken}`).send({ menu_item_id: ESPRESSO_ID, quantity: 1 });
    expect(res.status).toBe(201);
    espressoItemId = res.body.id as string;

    const order = await request(app).get(`/v1/orders/${orderId}`).set("Authorization", `Bearer ${terminalToken}`);
    expect(order.body.subtotal_cents).toBe(300);
  });

  it("POST /v1/orders/:id/items — add Latte → subtotal 750", async () => {
    const app = buildApp();
    const res = await request(app).post(`/v1/orders/${orderId}/items`).set("Authorization", `Bearer ${terminalToken}`).send({ menu_item_id: LATTE_ID, quantity: 1 });
    expect(res.status).toBe(201);
    latteItemId = res.body.id as string;

    const order = await request(app).get(`/v1/orders/${orderId}`).set("Authorization", `Bearer ${terminalToken}`);
    expect(order.body.subtotal_cents).toBe(750);
  });

  it("DELETE /v1/orders/:id/items/:item_id — void Latte → subtotal 300", async () => {
    const app = buildApp();
    const del = await request(app).delete(`/v1/orders/${orderId}/items/${latteItemId}`).set("Authorization", `Bearer ${terminalToken}`);
    expect(del.status).toBe(204);

    const order = await request(app).get(`/v1/orders/${orderId}`).set("Authorization", `Bearer ${terminalToken}`);
    expect(order.body.subtotal_cents).toBe(300);
  });

  it("POST /v1/orders/:id/send-to-kitchen → order status = fired", async () => {
    const app = buildApp();
    const res = await request(app).post(`/v1/orders/${orderId}/send-to-kitchen`).set("Authorization", `Bearer ${terminalToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("fired");
  });

  it("POST /v1/orders/:id/items/:item_id/bump → 200 + status bumped", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/v1/orders/${orderId}/items/${espressoItemId}/bump`)
      .set("Authorization", `Bearer ${terminalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("bumped");
    expect(res.body.bumped_at).toBeTruthy();
  });

  it("POST /v1/orders/:id/items/:item_id/bump — already bumped → 409", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/v1/orders/${orderId}/items/${espressoItemId}/bump`)
      .set("Authorization", `Bearer ${terminalToken}`);
    expect(res.status).toBe(409);
  });

  it("POST /v1/orders/:id/checkout → correct tax calculation", async () => {
    const app = buildApp();
    const res = await request(app).post(`/v1/orders/${orderId}/checkout`).set("Authorization", `Bearer ${terminalToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.subtotal_cents).toBe(300);
    // 300 * 825 / 10000 = 24.75 → rounds to 25
    expect(res.body.tax_cents).toBe(25);
    expect(res.body.tip_cents).toBe(0);
    expect(res.body.total_cents).toBe(325);
  });

  it("POST /v1/orders/:id/payments card_mock tip=60 → order paid, payment succeeded", async () => {
    const app = buildApp();
    const res = await request(app).post(`/v1/orders/${orderId}/payments`).set("Authorization", `Bearer ${terminalToken}`).send({ method: "card_mock", tip_cents: 60 });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe("succeeded");
    expect(res.body.payment.tip_cents).toBe(60);
    expect(res.body.order.status).toBe("paid");
  });

  it("POST /v1/orders/:id/void as cashier (terminal JWT) → 401 (wrong kind)", async () => {
    const app = buildApp();
    // Create a fresh order to attempt void
    const newOrder = await request(app).post("/v1/orders").set("Authorization", `Bearer ${terminalToken}`).send({ location_id: DEMO_LOCATION, staff_id: DEMO_STAFF });
    const newOrderId = newOrder.body.id as string;

    const res = await request(app).post(`/v1/orders/${newOrderId}/void`).set("Authorization", `Bearer ${terminalToken}`).send({ reason: "test void" });
    expect(res.status).toBe(401);
  });

  it("POST /v1/orders/:id/void as owner → 200 + voided", async () => {
    const app = buildApp();
    const newOrder = await request(app).post("/v1/orders").set("Authorization", `Bearer ${sessionToken}`).send({ location_id: DEMO_LOCATION });
    const newOrderId = newOrder.body.id as string;

    const res = await request(app).post(`/v1/orders/${newOrderId}/void`).set("Authorization", `Bearer ${sessionToken}`).send({ reason: "manager override test" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("voided");
    expect(res.body.voided_at).toBeTruthy();
  });

  it("POST /v1/orders without auth → 401", async () => {
    const app = buildApp();
    const res = await request(app).post("/v1/orders").send({ location_id: DEMO_LOCATION });
    expect(res.status).toBe(401);
  });

  void espressoItemId; // suppress unused var warning in skipped tests
});

describe("Orders auth guards — unit (no Supabase)", () => {
  it("GET /v1/orders/:id without auth → 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/orders/some-id");
    expect(res.status).toBe(401);
  });

  it("POST /v1/orders without auth → 401", async () => {
    const app = buildApp();
    const res = await request(app).post("/v1/orders").send({ location_id: DEMO_LOCATION });
    expect(res.status).toBe(401);
  });
});

describe("Bump endpoint auth guards — unit (no Supabase)", () => {
  it("POST /v1/orders/:id/items/:item_id/bump without auth → 401", async () => {
    const app = buildApp();
    const res = await request(app).post(
      "/v1/orders/00000000-0000-0000-0000-000000000001/items/00000000-0000-0000-0000-000000000002/bump"
    );
    expect(res.status).toBe(401);
  });

  it("POST /v1/orders/:id/items/:item_id/bump with valid JWT but no DB → 503", async () => {
    const app = buildApp();
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });
    const res = await request(app)
      .post(`/v1/orders/${DEMO_TENANT}/items/${DEMO_LOCATION}/bump`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(503);
  });
});
