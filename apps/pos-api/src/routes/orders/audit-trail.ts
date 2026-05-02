import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";

export const auditTrailRouter: IRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// GET /v1/orders/:id/audit-trail — session/owner+manager only
// ---------------------------------------------------------------------------
auditTrailRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const orderId = req.params["id"]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Verify order belongs to this tenant
    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!order) {
      res.status(404).json({ error: { code: "not_found", message: "Order not found" } });
      return;
    }

    const { data, error } = await db
      .from("audit_log")
      .select("id, staff_id, action, target_type, target_id, payload, ip_address, created_at")
      .eq("target_type", "order")
      .eq("target_id", orderId)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: { code: "internal_error", message: error.message } });
      return;
    }

    res.json(data ?? []);
  }
);
