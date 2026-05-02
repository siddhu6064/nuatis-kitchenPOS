import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const locationsRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /v1/locations — session JWT only; returns all locations for this tenant
// ---------------------------------------------------------------------------
locationsRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data, error } = await db
      .from("locations")
      .select("id, name, address, is_active")
      .eq("tenant_id", tenantId)
      .order("name");

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    res.json(data ?? []);
  }
);
