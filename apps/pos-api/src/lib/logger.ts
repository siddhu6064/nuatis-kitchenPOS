import pino from "pino";
import { env } from "../env.js";
import { SENSITIVE_KEYS_ARRAY } from "./redact.js";

// ---------------------------------------------------------------------------
// Pino redact paths derived from the single source-of-truth in redact.ts.
// We generate paths at three nesting depths (top-level, 1-deep, 2-deep),
// which covers all realistic log-context shapes without recursive overhead.
// ---------------------------------------------------------------------------
const redactPaths = SENSITIVE_KEYS_ARRAY.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
]);

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: "[REDACTED]" },
  },
  env.NODE_ENV === "development"
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined
);
