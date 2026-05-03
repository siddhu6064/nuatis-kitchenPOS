/**
 * Sentry integration for pos-api.
 *
 * Importing this module initializes Sentry when SENTRY_DSN is set.
 * No-op (no console output, no errors) when the DSN is absent.
 *
 * Sensitive fields (pin, password, api_key, authorization, cookie, …) are
 * scrubbed from all captured events via beforeSend before they leave the process.
 *
 * Usage in Express error handler:
 *   import { Sentry } from "../lib/sentry.js";
 *   Sentry.captureException(err);
 */
import * as Sentry from "@sentry/node";
import { env } from "../env.js";
import { redactSensitive } from "./redact.js";

export const sentryEnabled = Boolean(process.env["SENTRY_DSN"]);

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    environment: env.NODE_ENV,
    // Performance monitoring and Replay are deferred to post-launch
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub sensitive fields before the event leaves the process.
      // On any redaction error we still return the event so we never
      // silently lose an error report due to a bug in the scrubber itself.
      try {
        // Work on a shallow clone cast through unknown to satisfy the
        // strict ErrorEvent return type while applying structural redaction.
        const e = { ...event } as Record<string, unknown>;
        if (e["extra"]) e["extra"] = redactSensitive(e["extra"]);
        if (e["contexts"]) e["contexts"] = redactSensitive(e["contexts"]);
        if (e["request"]) {
          const r = { ...(e["request"] as Record<string, unknown>) };
          if (r["data"] !== undefined) r["data"] = redactSensitive(r["data"]);
          if (r["headers"]) r["headers"] = redactSensitive(r["headers"]);
          e["request"] = r;
        }
        return e as unknown as typeof event;
      } catch {
        return event;
      }
    },
  });
}

export { Sentry };
