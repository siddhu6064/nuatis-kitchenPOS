/**
 * Boot-time structured logger — zero external dependencies.
 *
 * Used by env.ts and other modules that load before the pino logger is ready.
 * In production (NODE_ENV=production) emits newline-delimited JSON to stderr.
 * In development emits prefixed plain-text lines to stderr.
 *
 * Matches the { info, warn, error, debug } surface of the pino logger so
 * callers can swap without changes.
 *
 * ctx objects are scrubbed through redactSensitive before serialization so
 * sensitive fields (pin, password, api_key, …) never appear in logs.
 */
import { redactSensitive } from "./redact.js";

const IS_PROD = process.env["NODE_ENV"] === "production";

function write(
  level: "info" | "warn" | "error" | "debug",
  msg: string,
  ctx?: Record<string, unknown>
): void {
  const safeCtx = ctx ? (redactSensitive(ctx) as Record<string, unknown>) : undefined;

  if (IS_PROD) {
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...safeCtx,
    };
    process.stderr.write(JSON.stringify(line) + "\n");
  } else {
    const prefix = `[${level.toUpperCase().padEnd(5)}]`;
    const extra = safeCtx ? " " + JSON.stringify(safeCtx) : "";
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : console.warn)(`${prefix} ${msg}${extra}`);
  }
}

export const bootLogger = {
  info:  (msg: string, ctx?: Record<string, unknown>) => write("info",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => write("warn",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
};
