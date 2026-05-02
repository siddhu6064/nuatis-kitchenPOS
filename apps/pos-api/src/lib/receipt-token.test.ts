import { describe, it, expect, vi } from "vitest";

// Mock env before any module load so Zod validation passes
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../env.js", () => ({
  env: {
    POS_JWT_SECRET: "test-jwt-secret-that-is-at-least-32-chars-long!!",
    RECEIPT_TOKEN_SECRET: undefined,
    RECEIPT_BASE_URL: "http://localhost:3002",
    NODE_ENV: "test",
  },
}));

import { signReceiptToken, verifyReceiptToken } from "./receipt-token.js";
import { SignJWT } from "jose";

describe("signReceiptToken / verifyReceiptToken", () => {
  const ORDER_ID = "11111111-1111-1111-1111-111111111111";
  const TENANT_ID = "22222222-2222-2222-2222-222222222222";

  it("round-trip: sign then verify returns same payload", async () => {
    const token = await signReceiptToken(ORDER_ID, TENANT_ID);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // HS256 JWT has 3 parts

    const payload = await verifyReceiptToken(token);
    expect(payload.kind).toBe("receipt");
    expect(payload.order_id).toBe(ORDER_ID);
    expect(payload.tenant_id).toBe(TENANT_ID);
  });

  it("token expiry is ~90 days from now", async () => {
    const token = await signReceiptToken(ORDER_ID, TENANT_ID);
    const payload = await verifyReceiptToken(token);
    const now = Math.floor(Date.now() / 1000);
    const TTL_90_DAYS = 60 * 60 * 24 * 90;
    expect(payload.exp - now).toBeGreaterThan(TTL_90_DAYS - 60);
    expect(payload.exp - now).toBeLessThanOrEqual(TTL_90_DAYS + 60);
  });

  it("rejects a token signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("a-completely-different-secret-32bytes!!");
    const token = await new SignJWT({ kind: "receipt", order_id: ORDER_ID, tenant_id: TENANT_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(wrongSecret);

    await expect(verifyReceiptToken(token)).rejects.toThrow();
  });

  it("rejects a token with an expired expiry", async () => {
    const secret = new TextEncoder().encode("test-jwt-secret-that-is-at-least-32-chars-long!!");
    const token = await new SignJWT({ kind: "receipt", order_id: ORDER_ID, tenant_id: TENANT_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100) // already expired
      .sign(secret);

    await expect(verifyReceiptToken(token)).rejects.toThrow();
  });

  it("rejects a token with kind !== 'receipt'", async () => {
    const secret = new TextEncoder().encode("test-jwt-secret-that-is-at-least-32-chars-long!!");
    const token = await new SignJWT({ kind: "session", order_id: ORDER_ID, tenant_id: TENANT_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(secret);

    await expect(verifyReceiptToken(token)).rejects.toThrow("Invalid token kind");
  });
});
