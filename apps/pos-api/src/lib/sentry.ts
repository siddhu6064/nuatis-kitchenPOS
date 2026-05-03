/**
 * Sentry integration for pos-api.
 *
 * Importing this module initializes Sentry when SENTRY_DSN is set.
 * No-op (no console output, no errors) when the DSN is absent.
 *
 * Usage in Express error handler:
 *   import { Sentry } from "../lib/sentry.js";
 *   Sentry.captureException(err);
 */
import * as Sentry from "@sentry/node";
import { env } from "../env.js";

export const sentryEnabled = Boolean(process.env["SENTRY_DSN"]);

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment: env.NODE_ENV,
    // Performance monitoring and Replay are deferred to post-launch
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export { Sentry };
