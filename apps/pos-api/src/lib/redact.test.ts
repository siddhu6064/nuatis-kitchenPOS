import { describe, it, expect } from "vitest";
import { redactSensitive, redactSentryEvent } from "./redact.js";

// ---------------------------------------------------------------------------
// redactSensitive
// ---------------------------------------------------------------------------
describe("redactSensitive", () => {
  it("redacts a top-level pin field, preserves non-sensitive fields", () => {
    const result = redactSensitive({ pin: "1234", name: "Bob" }) as Record<string, unknown>;
    expect(result["pin"]).toBe("[REDACTED]");
    expect(result["name"]).toBe("Bob");
  });

  it("redacts nested sensitive fields recursively", () => {
    const result = redactSensitive({
      user: { pin: "1234", name: "Bob", nested: { password: "secret" } },
    }) as { user: Record<string, unknown> };
    expect((result.user["pin"] as string)).toBe("[REDACTED]");
    expect((result.user["name"] as string)).toBe("Bob");
    expect(((result.user["nested"] as Record<string, unknown>)["password"] as string)).toBe("[REDACTED]");
  });

  it("redacts sensitive fields inside arrays of objects", () => {
    const result = redactSensitive([
      { pin: "1234", amount: 100 },
      { name: "ok", api_key: "key_live_xyz" },
    ]) as Array<Record<string, unknown>>;
    expect(result[0]["pin"]).toBe("[REDACTED]");
    expect(result[0]["amount"]).toBe(100);
    expect(result[1]["name"]).toBe("ok");
    expect(result[1]["api_key"]).toBe("[REDACTED]");
  });

  it("passes through non-object / non-array values unchanged", () => {
    expect(redactSensitive("plain string")).toBe("plain string");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBe(null);
    expect(redactSensitive(true)).toBe(true);
  });

  it("is case-insensitive on key names", () => {
    const result = redactSensitive({
      PIN: "1234",
      Password: "secret",
      AUTHORIZATION: "Bearer tok",
    }) as Record<string, unknown>;
    expect(result["PIN"]).toBe("[REDACTED]");
    expect(result["Password"]).toBe("[REDACTED]");
    expect(result["AUTHORIZATION"]).toBe("[REDACTED]");
  });

  it("redacts all declared sensitive key types", () => {
    const input: Record<string, string> = {
      pin: "a",
      password: "b",
      password_hash: "c",
      pin_hash: "d",
      stripe_secret: "e",
      api_key: "f",
      authorization: "g",
      cookie: "h",
    };
    const result = redactSensitive(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key], `${key} should be redacted`).toBe("[REDACTED]");
    }
  });

  it("preserves object structure (does not drop keys)", () => {
    const input = { pin: "1234", keep: "this" };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(["keep", "pin"].sort());
  });
});

// ---------------------------------------------------------------------------
// redactSentryEvent
// ---------------------------------------------------------------------------
describe("redactSentryEvent", () => {
  it("redacts event.request.data.pin and preserves other data fields", () => {
    const event = {
      request: {
        data: { pin: "1234", amount: 500 },
        headers: { authorization: "Bearer token", "content-type": "application/json" },
      },
    };
    const result = redactSentryEvent(event);
    expect((result.request?.data as Record<string, unknown>)["pin"]).toBe("[REDACTED]");
    expect((result.request?.data as Record<string, unknown>)["amount"]).toBe(500);
    expect(result.request?.headers?.["authorization"]).toBe("[REDACTED]");
    expect(result.request?.headers?.["content-type"]).toBe("application/json");
  });

  it("redacts event.extra sensitive fields", () => {
    const event = {
      extra: { password: "secret", info: "safe value" },
    };
    const result = redactSentryEvent(event);
    expect(result.extra?.["password"]).toBe("[REDACTED]");
    expect(result.extra?.["info"]).toBe("safe value");
  });

  it("redacts event.contexts sensitive fields", () => {
    const event = {
      contexts: {
        auth: { api_key: "key123", tenant: "t_abc" },
      },
    };
    const result = redactSentryEvent(event);
    expect(result.contexts?.["auth"]?.["api_key"]).toBe("[REDACTED]");
    expect(result.contexts?.["auth"]?.["tenant"]).toBe("t_abc");
  });

  it("does not mutate the original event object", () => {
    const event = { request: { data: { pin: "1234" } } };
    redactSentryEvent(event);
    expect((event.request.data as Record<string, unknown>)["pin"]).toBe("1234");
  });

  it("handles events with no sensitive fields (no-op)", () => {
    const event = { request: { data: { amount: 100 } }, extra: { trace_id: "abc" } };
    const result = redactSentryEvent(event);
    expect((result.request?.data as Record<string, unknown>)["amount"]).toBe(100);
    expect(result.extra?.["trace_id"]).toBe("abc");
  });
});
