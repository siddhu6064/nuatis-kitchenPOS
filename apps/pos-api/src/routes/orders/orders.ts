import { Router, type IRouter, type Request, type Response } from "express";
import { CreateOrderRequestSchema } from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { assertTenantOwns, writeAuditLog } from "../../lib/db.js";

export const ordersRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /v1/orders — create a new open order
// ---------------------------------------------------------------------------
ordersRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CreateOrderRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const tenantId = req.auth!.tenant_id;
  const { location_id } = parsed.data;

  // Validate location belongs to tenant
  const locationOwned = await assertTenantOwns(client, "locations", location_id, tenantId).catch(() => false);
  if (!locationOwned) { res.status(404).json({ error: { code: "not_found", message: "Location not found" } }); return; }

  // Resolve staff_id: terminal JWT has staff_id, session JWT has user_id
  const staffId = req.auth!.kind === "terminal"
    ? req.auth!.staff_id
    : (parsed.data.staff_id ?? req.auth!.user_id);

  // Look up tenant vertical (required column on orders)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (client as any).from("tenants").select("vertical").eq("id", tenantId).maybeSingle();
  const vertical = (tenant?.vertical as string) ?? "cafe";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error } = await (client as any)
    .from("orders")
    .insert({
      tenant_id: tenantId,
      location_id,
      opened_by_staff_id: staffId,
      vertical,
      status: "open",
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "order_created", target_type: "order", target_id: order.id, ip_address: req.ip });

  res.status(201).json(order);
});

// ---------------------------------------------------------------------------
// GET /v1/orders/:id — fetch order with items + payments
// ---------------------------------------------------------------------------
ordersRouter.get("/:id", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const [orderRes, itemsRes, paymentsRes] = await Promise.all([
    db.from("orders").select("*").eq("id", req.params["id"]).eq("tenant_id", tenantId).maybeSingle(),
    db.from("order_items").select("*").eq("order_id", req.params["id"]).order("created_at"),
    db.from("payments").select("*").eq("order_id", req.params["id"]).eq("tenant_id", tenantId).order("created_at"),
  ]);

  if (!orderRes.data) { res.status(404).json({ error: { code: "not_found", message: "Order not found" } }); return; }
  if (orderRes.error) { res.status(500).json({ error: { code: "internal_error", message: orderRes.error.message } }); return; }

  res.json({ ...orderRes.data, items: itemsRes.data ?? [], payments: paymentsRes.data ?? [] });
});

// ---------------------------------------------------------------------------
// GET /v1/orders — list (session/owner+manager only)
// ---------------------------------------------------------------------------
ordersRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const { status, location_id, limit } = req.query as Record<string, string | undefined>;
    const limitNum = Math.min(parseInt(limit ?? "50", 10) || 50, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (client as any).from("orders").select("*").eq("tenant_id", req.auth!.tenant_id).order("opened_at", { ascending: false }).limit(limitNum);

    if (status) q = q.eq("status", status);
    if (location_id) q = q.eq("location_id", location_id);

    const { data, error } = await q;
    if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }
    res.json(data ?? []);
  }
);
