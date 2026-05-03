import { describe, it, expect } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { SENSITIVE_KEYS_ARRAY } from "./redact.js";

// ---------------------------------------------------------------------------
// Helper — creates a fresh pino instance with the same redact config as the
// production logger, writing to an in-memory Writable so we can assert on
// the emitted JSON. flush() is awaited to drain sonic-boom's internal buffer.
// ---------------------------------------------------------------------------
function makeTestLogger() {
  const lines: string[] = [];
  const dest = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      lines.push(chunk.toString().trim());
      cb();
    },
  });

  const redactPaths = SENSITIVE_KEYS_ARRAY.flatMap((key) => [
    key,
    `*.${key}`,
    `*.*.${key}`,
  ]);

  const log = pino(
    { level: "debug", redact: { paths: redactPaths, censor: "[REDACTED]" } },
    dest
  );

  async function flush(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      log.flush((err?: Error) => { if (err) reject(err); else resolve(); });
    });
  }

  return { log, lines, flush };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("pino logger — sensitive-field redaction via built-in redact option", () => {
  it("redacts pin nested one level deep (user.pin)", async () => {
    const { log, lines, flush } = makeTestLogger();
    log.info({ user: { pin: "1234", name: "Bob" } }, "test message");
    await flush();

    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    const user = entry["user"] as Record<string, unknown>;
    expect(user["pin"]).toBe("[REDACTED]");
    expect(user["name"]).toBe("Bob");
  });

  it("redacts top-level password while preserving other top-level fields", async () => {
    const { log, lines, flush } = makeTestLogger();
    log.info({ password: "secret", email: "a@b.com" }, "test");
    await flush();

    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry["password"]).toBe("[REDACTED]");
    expect(entry["email"]).toBe("a@b.com");
  });

  it("redacts authorization header nested in request context", async () => {
    const { log, lines, flush } = makeTestLogger();
    log.info({ req: { authorization: "Bearer tok123", method: "POST" } }, "test");
    await flush();

    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    const req = entry["req"] as Record<string, unknown>;
    expect(req["authorization"]).toBe("[REDACTED]");
    expect(req["method"]).toBe("POST");
  });

  it("does not redact non-sensitive fields", async () => {
    const { log, lines, flush } = makeTestLogger();
    log.info({ amount: 100, tenant_id: "abc-123", action: "void" }, "test");
    await flush();

    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry["amount"]).toBe(100);
    expect(entry["tenant_id"]).toBe("abc-123");
    expect(entry["action"]).toBe("void");
  });

  it("redacts all keys in SENSITIVE_KEYS_ARRAY at top level", async () => {
    const { log, lines, flush } = makeTestLogger();
    const ctx: Record<string, string> = {};
    for (const key of SENSITIVE_KEYS_ARRAY) ctx[key] = "should-be-redacted";
    log.info(ctx, "test");
    await flush();

    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    for (const key of SENSITIVE_KEYS_ARRAY) {
      expect(entry[key], `${key} should be redacted`).toBe("[REDACTED]");
    }
  });
});
