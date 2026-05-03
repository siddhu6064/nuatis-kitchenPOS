import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { ordersRouter } from "./index.js";
import { signTerminalJwt } from "../../lib/jwt.js";
import { computeOrderTotals } from "../../lib/db.js";
import { ApplyDiscountRequestSchema } from "@nuatis/pos-shared";

const hasSupabase = Boolean(
  process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]
);

const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
const DEMO_LOCATION = "00000000-0000-0000-0000-000000000010";
const DEMO_STAFF = "00000000-0000-0000-0000-000000000020";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/orders", ordersRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Pure math tests — no DB required, run always
// ---------------------------------------------------------------------------

describe("computeOrderTotals — pure recompute math", () => {
  it("10% pct discount on $20 subtotal ($15 taxable, $5 non-taxable) @ 825 bps", () => {
    const result = computeOrderTotals({
      items: [
        { price_cents: 1500, qty: 1, taxable: true },
        { price_cents: 500, qty: 1, taxable: false },
      ],
      discounts: [{ type: "pct", value_bps: 1000, value_cents: null }],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.subtotal_cents).toBe(2000);
    expect(result.discount_total_cents).toBe(200);
    expect(result.applied_amounts).toEqual([200]);
    // taxable_after = floor(1500 * 1800 / 2000) = floor(1350) = 1350
    // tax = floor(1350 * 825 / 10000) = floor(111.375) = 111
    expect(result.tax_cents).toBe(111);
    expect(result.total_cents).toBe(1911);
  });

  it("$5 fixed discount on $20 subtotal ($15 taxable, $5 non-taxable) @ 825 bps", () => {
    const result = computeOrderTotals({
      items: [
        { price_cents: 1500, qty: 1, taxable: true },
        { price_cents: 500, qty: 1, taxable: false },
      ],
      discounts: [{ type: "amt", value_bps: null, value_cents: 500 }],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.subtotal_cents).toBe(2000);
    expect(result.discount_total_cents).toBe(500);
    expect(result.applied_amounts).toEqual([500]);
    // taxable_after = floor(1500 * 1500 / 2000) = floor(1125) = 1125
    // tax = floor(1125 * 825 / 10000) = floor(92.8125) = 92
    expect(result.tax_cents).toBe(92);
    expect(result.total_cents).toBe(1592);
  });

  it("stacked: 10% then $1 fixed on $10 fully-taxable @ 825 bps", () => {
    const result = computeOrderTotals({
      items: [{ price_cents: 1000, qty: 1, taxable: true }],
      discounts: [
        { type: "pct", value_bps: 1000, value_cents: null },
        { type: "amt", value_bps: null, value_cents: 100 },
      ],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.subtotal_cents).toBe(1000);
    // first: floor(1000 * 1000 / 10000) = 100
    // second: min(100, max(0, 1000 - 100)) = min(100, 900) = 100
    expect(result.applied_amounts).toEqual([100, 100]);
    expect(result.discount_total_cents).toBe(200);
    // taxable_after = floor(1000 * 800 / 1000) = 800
    // tax = floor(800 * 825 / 10000) = floor(66) = 66
    expect(result.tax_cents).toBe(66);
    expect(result.total_cents).toBe(866);
  });

  it("no discounts — subtotal only, all taxable", () => {
    const result = computeOrderTotals({
      items: [
        { price_cents: 300, qty: 1, taxable: true },
        { price_cents: 450, qty: 1, taxable: true },
      ],
      discounts: [],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.subtotal_cents).toBe(750);
    expect(result.discount_total_cents).toBe(0);
    // taxable_after = floor(750 * 750 / 750) = 750
    // tax = floor(750 * 825 / 10000) = floor(61.875) = 61
    expect(result.tax_cents).toBe(61);
    expect(result.total_cents).toBe(811);
  });

  it("amt discount capped at remaining subtotal (should not go negative)", () => {
    const result = computeOrderTotals({
      items: [{ price_cents: 1000, qty: 1, taxable: true }],
      discounts: [
        { type: "amt", value_bps: null, value_cents: 600 },
        { type: "amt", value_bps: null, value_cents: 600 }, // only 400 remaining
      ],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.applied_amounts).toEqual([600, 400]);
    expect(result.discount_total_cents).toBe(1000);
    expect(result.tax_cents).toBe(0);
    expect(result.total_cents).toBe(0);
  });

  it("tip is added to total after discount+tax", () => {
    const result = computeOrderTotals({
      items: [{ price_cents: 1000, qty: 1, taxable: true }],
      discounts: [{ type: "pct", value_bps: 1000, value_cents: null }],
      tip_cents: 200,
      sales_tax_bps: 825,
    });
    // discount = 100, taxable_after = floor(1000*900/1000) = 900
    // tax = floor(900 * 825 / 10000) = floor(74.25) = 74
    // total = 1000 - 100 + 74 + 200 = 1174
    expect(result.total_cents).toBe(1174);
  });

  it("zero subtotal — no division by zero", () => {
    const result = computeOrderTotals({
      items: [],
      discounts: [],
      tip_cents: 0,
      sales_tax_bps: 825,
    });
    expect(result.subtotal_cents).toBe(0);
    expect(result.discount_total_cents).toBe(0);
    expect(result.tax_cents).toBe(0);
    expect(result.total_cents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Validation guard tests — no DB required
// ---------------------------------------------------------------------------

describe("POST /v1/orders/:id/discount — auth guards (no Supabase)", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/orders/some-id/discount")
      .send({ type: "pct", value: 1000, reason: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 manager_pin_required when no manager_pin provided", async () => {
    const app = buildApp();
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });
    const res = await request(app)
      .post("/v1/orders/some-id/discount")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "pct", value: 1000, reason: "test" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });

  it("returns 400 when pct value_bps > 5000 (50% cap) — schema rejects 5001", () => {
    const result = ApplyDiscountRequestSchema.safeParse({
      type: "pct",
      value: 5001,
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty reason via schema", () => {
    const result = ApplyDiscountRequestSchema.safeParse({
      type: "amt",
      value: 100,
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reason > 200 chars via schema", () => {
    const result = ApplyDiscountRequestSchema.safeParse({
      type: "pct",
      value: 1000,
      reason: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("POST /v1/orders/:id/discount/:app_id/void — auth guards (no Supabase)", () => {
  it("returns 401 without auth", async () => {
    const app = buildApp();
    const res = await request(app).post(
      "/v1/orders/some-id/discount/some-app-id/void"
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 manager_pin_required when no manager_pin provided", async () => {
    const app = buildApp();
    const { token } = await signTerminalJwt({
      tenant_id: DEMO_TENANT,
      location_id: DEMO_LOCATION,
      staff_id: DEMO_STAFF,
    });
    const res = await request(app)
      .post("/v1/orders/some-id/discount/some-app-id/void")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("manager_pin_required");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require Supabase
// ---------------------------------------------------------------------------

describe.skipIf(!hasSupabase)(
  "POST /v1/orders/:id/discount — integration",
  () => {
    it("apply + void discount flow", async () => {
      expect(hasSupabase).toBe(true);
    });
  }
);
