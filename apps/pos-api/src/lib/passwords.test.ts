import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, hashPin, verifyPin } from "./passwords.js";

describe("passwords — hashPassword + verifyPassword", () => {
  it("round-trip succeeds", async () => {
    const hash = await hashPassword("correctHorse99");
    const ok = await verifyPassword("correctHorse99", hash);
    expect(ok).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correctHorse99");
    const ok = await verifyPassword("wrongpassword", hash);
    expect(ok).toBe(false);
  });

  it("same password produces different hashes (salt working)", async () => {
    const [a, b] = await Promise.all([
      hashPassword("samepassword"),
      hashPassword("samepassword"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("passwords — hashPin + verifyPin", () => {
  it("round-trip succeeds", async () => {
    const hash = await hashPin("4321");
    const ok = await verifyPin("4321", hash);
    expect(ok).toBe(true);
  });
});
