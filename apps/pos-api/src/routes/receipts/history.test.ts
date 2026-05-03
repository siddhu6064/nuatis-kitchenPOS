import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { receiptHistoryRouter } from "./history.js";
import { authRouter } from "../auth.js";
import { ReceiptHistoryResponseSchema } from "@nuatis/pos-shared";

const hasSupabase = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/auth", authRouter);
  app.use("/v1/receipts", receiptHistoryRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: schema validation (always run)
// ---------------------------------------------------------------------------
describe("ReceiptHistoryResponseSchema — unit validation", () => {
  it("accepts valid response shape", () => {
    const result = ReceiptHistoryResponseSchema.safeParse({
      entries: [
        {
          id: "1",
          order_id: "00000000-0000-0000-0000-000000000099",
          order_number: 42,
          order_total_cents: 1500,
          channel: "email",
          recipient: "guest@example.com",
          status: "sent",
          provider_message_id: "msg_abc",
          error: null,
          sent_at: "2026-05-01T12:00:00.000Z",
          created_at: "2026-05-01T11:59:00.000Z",
        },
      ],
      total_count: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts sms entry without bounced status", () => {
    const result = ReceiptHistoryResponseSchema.safeParse({
      entries: [
        {
          id: "2",
          order_id: null,
          order_number: null,
          order_total_cents: null,
          channel: "sms",
          recipient: "+15125551234",
          status: "failed",
          provider_message_id: null,
          error: "Invalid phone",
          sent_at: null,
          created_at: "2026-05-01T11:59:00.000Z",
        },
      ],
      total_count: 1,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit: auth guards (no Supabase needed)
// ---------------------------------------------------------------------------
describe("GET /v1/receipts — auth guards", () => {
  it("returns 401 without auth", async () => {
    const res = await request(buildApp()).get("/v1/receipts");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Integration (Supabase required)
// ---------------------------------------------------------------------------
describe.skipIf(!hasSupabase)("GET /v1/receipts — integration", () => {
  it("returns paginated list with total_count", async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    expect(signIn.status).toBe(200);
    const token = signIn.body.token as string;

    const res = await request(app)
      .get("/v1/receipts?limit=10&offset=0")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("entries");
    expect(res.body).toHaveProperty("total_count");
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it("channel=email filter returns only email entries", async () => {
    const app = buildApp();
    const signIn = await request(app)
      .post("/v1/auth/sign-in")
      .send({ email: "owner@democafe.test", password: "demo1234" });
    const token = signIn.body.token as string;

    const res = await request(app)
      .get("/v1/receipts?channel=email")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const entry of res.body.entries as Array<{ channel: string }>) {
      expect(entry.channel).toBe("email");
    }
  });
});
