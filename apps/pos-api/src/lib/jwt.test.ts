import { describe, it, expect } from "vitest";
import { signSessionJwt, signTerminalJwt, verifyJwt } from "./jwt.js";

const SESSION_PARAMS = {
  tenant_id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000020",
  role: "owner" as const,
};

const TERMINAL_PARAMS = {
  tenant_id: "00000000-0000-0000-0000-000000000001",
  location_id: "00000000-0000-0000-0000-000000000010",
  staff_id: "00000000-0000-0000-0000-000000000020",
};

describe("JWT — signSessionJwt", () => {
  it("produces a token that verifyJwt parses with kind=session", async () => {
    const { token } = await signSessionJwt(SESSION_PARAMS);
    const payload = await verifyJwt(token);
    expect(payload.kind).toBe("session");
    if (payload.kind === "session") {
      expect(payload.tenant_id).toBe(SESSION_PARAMS.tenant_id);
      expect(payload.user_id).toBe(SESSION_PARAMS.user_id);
      expect(payload.role).toBe("owner");
    }
  });
});

describe("JWT — signTerminalJwt", () => {
  it("produces a token that verifyJwt parses with kind=terminal", async () => {
    const { token } = await signTerminalJwt(TERMINAL_PARAMS);
    const payload = await verifyJwt(token);
    expect(payload.kind).toBe("terminal");
    if (payload.kind === "terminal") {
      expect(payload.tenant_id).toBe(TERMINAL_PARAMS.tenant_id);
      expect(payload.staff_id).toBe(TERMINAL_PARAMS.staff_id);
      expect(payload.role).toBe("cashier");
    }
  });
});

describe("JWT — verifyJwt rejection cases", () => {
  it("rejects a token signed with a different secret", async () => {
    // Sign with default secret, then verify: a token from a different secret
    // We simulate by mutating the signature part of a valid token
    const { token } = await signSessionJwt(SESSION_PARAMS);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.invalidsignatureXXXXXXXXXXXXXXXXXX`;
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    // Manually build a token with past exp via SignJWT
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test-secret-do-not-use-in-production-x7k2");
    const expiredToken = await new SignJWT({
      kind: "session",
      tenant_id: SESSION_PARAMS.tenant_id,
      user_id: SESSION_PARAMS.user_id,
      role: "owner",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret);

    await expect(verifyJwt(expiredToken)).rejects.toThrow();
  });

  it("rejects a token with alg:none (algorithm confusion attack)", async () => {
    // Manually construct a JWT with alg:none header
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        kind: "session",
        tenant_id: SESSION_PARAMS.tenant_id,
        user_id: SESSION_PARAMS.user_id,
        role: "owner",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const noneToken = `${header}.${payload}.`;
    await expect(verifyJwt(noneToken)).rejects.toThrow();
  });
});
