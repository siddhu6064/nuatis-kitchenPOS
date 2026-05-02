import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const listReportsRouter: IRouter = Router();

const ListHistoryQuerySchema = z.object({
  location_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(90).default(30),
});

// ---------------------------------------------------------------------------
// GET /v1/reports/daily-history
// ---------------------------------------------------------------------------
listReportsRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = ListHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid query params", details: parsed.error.flatten() } });
      return;
    }

    const { location_id, limit } = parsed.data;
    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const query = db
      .from("reports_daily")
      .select("date, gross_sales_cents, net_cents, order_count")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(limit);

    if (location_id) {
      query.eq("location_id", location_id);
    } else {
      query.is("location_id", null);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    res.json(data ?? []);
  }
);
