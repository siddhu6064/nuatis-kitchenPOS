import { Router, type IRouter, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getSupabaseClient } from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8")
) as { version: string };

const startedAt = Date.now();

export const healthRouter: IRouter = Router();

healthRouter.get("/health", async (_req: Request, res: Response) => {
  const client = getSupabaseClient();

  let supabaseStatus: "connected" | "disconnected" | "not_configured";

  if (!client) {
    supabaseStatus = "not_configured";
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const { error } = await client
        .from("tenants")
        .select("id")
        .limit(1)
        .abortSignal(controller.signal);
      clearTimeout(timeout);
      supabaseStatus = error ? "disconnected" : "connected";
    } catch {
      supabaseStatus = "disconnected";
    }
  }

  res.status(200).json({
    status: "ok",
    supabase: supabaseStatus,
    uptime_ms: Date.now() - startedAt,
    version: pkg.version,
    timestamp: new Date().toISOString(),
  });
});
