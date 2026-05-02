import { describe, it, expect, vi } from "vitest";
import { SendReceiptRequestSchema } from "@nuatis/pos-shared";

// ---------------------------------------------------------------------------
// Unit tests — always run (no Supabase required)
// ---------------------------------------------------------------------------

describe("SendReceiptRequestSchema", () => {
  it("accepts email only", () => {
    const result = SendReceiptRequestSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(true);
    expect(result.data?.sms_opt_in).toBe(false);
  });

  it("accepts phone only", () => {
    const result = SendReceiptRequestSchema.safeParse({ phone: "+12125551234" });
    expect(result.success).toBe(true);
  });

  it("accepts both email and phone", () => {
    const result = SendReceiptRequestSchema.safeParse({
      email: "a@b.com",
      phone: "+12125551234",
      sms_opt_in: true,
      sms_opt_in_text: "I agree to receive text receipts.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither email nor phone is provided", () => {
    const result = SendReceiptRequestSchema.safeParse({ sms_opt_in: false });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/email.*phone|phone.*email/i);
  });

  it("rejects invalid email", () => {
    const result = SendReceiptRequestSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects phone that is not E.164", () => {
    const result = SendReceiptRequestSchema.safeParse({ phone: "555-1234" });
    expect(result.success).toBe(false);
  });

  it("accepts E.164 phone without leading +", () => {
    // Per regex: ^\+?[1-9]\d{1,14}$
    const result = SendReceiptRequestSchema.safeParse({ phone: "12125551234" });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = SendReceiptRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mock-mode sendReceiptEmail unit test
// ---------------------------------------------------------------------------

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../env.js", () => ({
  env: {
    POS_JWT_SECRET: "test-jwt-secret-that-is-at-least-32-chars-long!!",
    RECEIPT_TOKEN_SECRET: undefined,
    RESEND_API_KEY: undefined,
    TELNYX_API_KEY: undefined,
    RECEIPT_BASE_URL: "http://localhost:3002",
    NODE_ENV: "test",
  },
}));

import { sendReceiptEmail } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";

describe("sendReceiptEmail — mock mode", () => {
  it("returns a mock message id when RESEND_API_KEY is absent", async () => {
    const result = await sendReceiptEmail({
      to: "test@example.com",
      subject: "Your receipt",
      html: "<p>hello</p>",
      text: "hello",
    });
    expect(result.id).toMatch(/^mock-email-/);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com" }),
      expect.stringContaining("[mock email]")
    );
  });
});

// ---------------------------------------------------------------------------
// Integration tests — skipped when Supabase not configured
// ---------------------------------------------------------------------------

const SUPABASE_CONFIGURED =
  Boolean(process.env["SUPABASE_URL"]) &&
  Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);

describe.skipIf(!SUPABASE_CONFIGURED)(
  "POST /v1/orders/:id/receipts — integration",
  () => {
    it.todo("create order → pay → POST receipts → email_messages row exists with status=queued");
  }
);
