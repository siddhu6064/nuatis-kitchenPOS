/**
 * Sensitive-field redaction helpers.
 *
 * Used by boot-logger (ctx redaction before serialization) and Sentry
 * (beforeSend event scrubbing). Zero external dependencies.
 *
 * Redaction is:
 *  - Case-insensitive on key names
 *  - Recursive through nested objects and arrays
 *  - Non-destructive on shape: sensitive values become '[REDACTED]', keys kept
 *  - Safe: non-object/array values pass through unchanged
 */

const SENSITIVE: ReadonlySet<string> = new Set([
  "pin",
  "password",
  "password_hash",
  "pin_hash",
  "stripe_secret",
  "api_key",
  "authorization",
  "cookie",
]);

export function redactSensitive(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    result[key] = SENSITIVE.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(val);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sentry event scrubber — compatible with @sentry/node Event shape
// ---------------------------------------------------------------------------

interface SentryEventLike {
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  request?: {
    data?: unknown;
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function redactSentryEvent<T extends SentryEventLike>(event: T): T {
  const e = { ...event };

  if (e.extra) {
    e.extra = redactSensitive(e.extra) as Record<string, unknown>;
  }
  if (e.contexts) {
    e.contexts = redactSensitive(e.contexts) as Record<string, Record<string, unknown>>;
  }
  if (e.request) {
    e.request = { ...e.request };
    if (e.request.data !== undefined) {
      e.request.data = redactSensitive(e.request.data);
    }
    if (e.request.headers) {
      e.request.headers = redactSensitive(e.request.headers) as Record<string, string>;
    }
  }

  return e;
}
