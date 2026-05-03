import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Test helper — creates a fresh rate limiter with the same 429 handler shape
// as the production limiters but with a configurable limit.
// A fresh instance is created per test so stores don't bleed across tests.
// ---------------------------------------------------------------------------
function makeTestLimiter(limit: number, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resetTime: Date | undefined = (req as any).rateLimit?.resetTime as Date | undefined;
      const retryAfterMs = resetTime instanceof Date
        ? Math.max(0, resetTime.getTime() - Date.now())
        : windowMs;
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many requests. Please try again later.",
          retry_after_seconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        },
      });
    },
  });
}

function buildApp(limit: number) {
  const app = express();
  app.use(express.json());
  const limiter = makeTestLimiter(limit);
  app.post("/test", limiter, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("rate-limit — 429 response shape", () => {
  it("allows requests within the limit", async () => {
    const app = buildApp(2);
    const res = await request(app).post("/test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 429 after the limit is exceeded", async () => {
    const app = buildApp(1);
    // First request: allowed
    await request(app).post("/test").expect(200);
    // Second request: blocked
    const res = await request(app).post("/test");
    expect(res.status).toBe(429);
  });

  it("429 body matches the standard error envelope", async () => {
    const app = buildApp(1);
    await request(app).post("/test"); // exhaust limit
    const res = await request(app).post("/test");
    const { error } = res.body as { error: { code: string; message: string; retry_after_seconds: number } };
    expect(error.code).toBe("rate_limited");
    expect(typeof error.message).toBe("string");
    expect(error.message.length).toBeGreaterThan(0);
    expect(typeof error.retry_after_seconds).toBe("number");
    expect(error.retry_after_seconds).toBeGreaterThan(0);
  });

  it("sets RateLimit-* response headers on allowed requests", async () => {
    const app = buildApp(5);
    const res = await request(app).post("/test");
    expect(res.status).toBe(200);
    // standardHeaders: true emits RateLimit-Limit and RateLimit-Remaining
    expect(res.headers["ratelimit-limit"] ?? res.headers["x-ratelimit-limit"]).toBeDefined();
  });
});
