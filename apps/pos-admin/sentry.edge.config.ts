/**
 * Sentry edge-runtime configuration — runs in Next.js middleware and
 * any route segments that opt in to the Edge Runtime.
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
    tracesSampleRate: 0,
  });
}
