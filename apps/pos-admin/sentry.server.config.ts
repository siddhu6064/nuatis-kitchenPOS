/**
 * Sentry server-side configuration — runs in Node.js (Next.js server components,
 * API routes, and Server Actions).
 *
 * Reads SENTRY_DSN (server-only, not exposed to the browser).
 * No-op when the env var is absent — zero console output, zero network calls.
 *
 * This file is automatically picked up by @sentry/nextjs via withSentryConfig.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Performance monitoring deferred to post-launch
    tracesSampleRate: 0,
  });
}
