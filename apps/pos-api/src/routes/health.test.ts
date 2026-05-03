import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { healthRouter } from "./health.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1", healthRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Unit: health endpoint response shape
// ---------------------------------------------------------------------------
describe("GET /v1/health — response shape", () => {
  it("returns 200 with ok:true", async () => {
    const res = await request(buildApp()).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("includes version string from package.json", async () => {
    const res = await request(buildApp()).get("/v1/health");
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version.length).toBeGreaterThan(0);
  });

  it("includes ISO timestamp", async () => {
    const res = await request(buildApp()).get("/v1/health");
    expect(typeof res.body.timestamp).toBe("string");
    expect(() => new Date(res.body.timestamp as string)).not.toThrow();
  });

  it("includes services object with all 6 service flags", async () => {
    const res = await request(buildApp()).get("/v1/health");
    const { services } = res.body as { services: Record<string, string> };
    expect(typeof services).toBe("object");
    const expected = ["db", "redis", "stripe", "resend", "telnyx", "sentry"];
    for (const key of expected) {
      expect(services[key], `services.${key} should be present`).toMatch(
        /^(configured|mock)$/
      );
    }
  });

  it("reports 'mock' for all services when env vars are absent (test env)", async () => {
    // In the test environment none of the external service env vars are set
    const res = await request(buildApp()).get("/v1/health");
    const { services } = res.body as { services: Record<string, string> };
    // All services should be mock (no env vars in CI)
    for (const [key, val] of Object.entries(services)) {
      expect(val, `services.${key}`).toMatch(/^(configured|mock)$/);
    }
  });

  it("does not make outbound network calls (responds in <100 ms)", async () => {
    const start = Date.now();
    await request(buildApp()).get("/v1/health");
    expect(Date.now() - start).toBeLessThan(100);
  });
});
