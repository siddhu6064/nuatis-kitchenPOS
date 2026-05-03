import "dotenv/config";
import { z } from "zod";
import { bootLogger } from "./lib/boot-logger.js";

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  POS_JWT_SECRET: z.string().min(32, "POS_JWT_SECRET must be at least 32 characters"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  // Comma-separated list of allowed origins for CORS. Optional — if not set,
  // CORS middleware is skipped (fine for Replit proxy; needed for local dev).
  CORS_ALLOWED_ORIGINS: z.string().min(1).optional(),

  // ---------------------------------------------------------------------------
  // Receipt delivery — all optional; mock mode runs without any of them
  // ---------------------------------------------------------------------------
  UPSTASH_REDIS_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  TELNYX_API_KEY: z.string().min(1).optional(),
  TELNYX_FROM_NUMBER: z.string().min(1).optional(),
  RECEIPT_BASE_URL: z.string().url().default("http://localhost:3002"),
  RECEIPT_TOKEN_SECRET: z.string().min(1).optional(),

  // ---------------------------------------------------------------------------
  // Stripe Connect + Terminal — all optional; routes return 503 in mock mode
  // ---------------------------------------------------------------------------
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PLATFORM_ACCOUNT_ID: z.string().min(1).optional(),
  STRIPE_CONNECT_RETURN_URL: z.string().url().optional(),
  STRIPE_CONNECT_REFRESH_URL: z.string().url().optional(),

  // ---------------------------------------------------------------------------
  // Error monitoring — optional; Sentry is disabled when DSN is absent
  // ---------------------------------------------------------------------------
  SENTRY_DSN: z.string().url().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  bootLogger.error("[env] Invalid environment variables", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  bootLogger.warn("[env] Supabase not configured — db: mock");
}
if (!env.UPSTASH_REDIS_URL) {
  bootLogger.warn("[env] UPSTASH_REDIS_URL not set — receipt workers in mock mode");
}
if (!env.RESEND_API_KEY) {
  bootLogger.warn("[env] RESEND_API_KEY not set — email delivery in mock mode");
}
if (!env.TELNYX_API_KEY) {
  bootLogger.warn("[env] TELNYX_API_KEY not set — SMS delivery in mock mode");
}
if (!env.STRIPE_SECRET_KEY) {
  bootLogger.warn("[env] STRIPE_SECRET_KEY not set — Stripe integration in mock mode");
}
