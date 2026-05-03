/**
 * Sentry client-side configuration — runs in the browser.
 *
 * Reads NEXT_PUBLIC_SENTRY_DSN (exposed via Next.js NEXT_PUBLIC_ prefix).
 * No-op when the env var is absent — zero console output, zero network calls.
 *
 * This file is automatically picked up by @sentry/nextjs via withSentryConfig.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Performance monitoring and Session Replay are deferred to post-launch
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
