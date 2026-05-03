import { Router, type IRouter, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8")
) as { version: string };

type ServiceStatus = "configured" | "mock";

function flag(envVar: string | undefined): ServiceStatus {
  return envVar ? "configured" : "mock";
}

export const healthRouter: IRouter = Router();

// No outbound calls — env-presence checks only so the endpoint is always fast.
healthRouter.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    version: pkg.version,
    timestamp: new Date().toISOString(),
    services: {
      db:     flag(process.env["SUPABASE_URL"]),
      redis:  flag(process.env["UPSTASH_REDIS_URL"]),
      stripe: flag(process.env["STRIPE_SECRET_KEY"]),
      resend: flag(process.env["RESEND_API_KEY"]),
      telnyx: flag(process.env["TELNYX_API_KEY"]),
      sentry: flag(process.env["SENTRY_DSN"]),
    },
  });
});
