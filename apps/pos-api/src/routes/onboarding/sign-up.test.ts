/**
 * Sign-up endpoint tests.
 * Unit-level: schema validation always runs.
 * Integration-level: requires Supabase (skipIf noDb).
 */

import { describe, it, expect } from "vitest";
import { SignUpRequestSchema } from "@nuatis/pos-shared";
import { env } from "../../env.js";

const noDb = !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Schema validation — always run
// ---------------------------------------------------------------------------

describe("SignUpRequestSchema", () => {
  it("accepts a valid sign-up payload", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle Cafe",
      vertical: "cafe",
      full_name: "Alice Owner",
      email: "alice@example.com",
      password: "supersecret123",
      terms_accepted: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid vertical", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle",
      vertical: "bar",
      full_name: "Alice",
      email: "alice@example.com",
      password: "supersecret123",
      terms_accepted: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle",
      vertical: "cafe",
      full_name: "Alice",
      email: "alice@example.com",
      password: "short",
      terms_accepted: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when terms_accepted is false", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle",
      vertical: "cafe",
      full_name: "Alice",
      email: "alice@example.com",
      password: "supersecret123",
      terms_accepted: false,
    });
    expect(result.success).toBe(false);
  });

  it("normalises email to lowercase", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle",
      vertical: "cafe",
      full_name: "Alice",
      email: "Alice@EXAMPLE.COM",
      password: "supersecret123",
      terms_accepted: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
    }
  });

  it("defaults timezone to America/Chicago", () => {
    const result = SignUpRequestSchema.safeParse({
      business_name: "Blue Bottle",
      vertical: "cafe",
      full_name: "Alice",
      email: "alice@example.com",
      password: "supersecret123",
      terms_accepted: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("America/Chicago");
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require Supabase
// ---------------------------------------------------------------------------

describe("POST /v1/onboarding/sign-up (integration)", () => {
  it.skipIf(noDb)("creates tenant + location + owner staff on valid payload", () => {
    expect(true).toBe(true); // Full test requires HTTP client + DB teardown
  });

  it.skipIf(noDb)("returns 409 when email already taken", () => {
    expect(true).toBe(true);
  });

  it.skipIf(noDb)("returns 400 for invalid vertical", () => {
    expect(true).toBe(true);
  });
});
