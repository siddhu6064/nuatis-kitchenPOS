import "dotenv/config";
import { z } from "zod";

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
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(
    "[env] Invalid environment variables:\n",
    result.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = result.data;

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[env] Supabase not configured — /v1/health will report supabase: not_configured"
  );
}
