import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  OpenSessionRequestSchema,
  LogCashEventRequestSchema,
  CloseSessionRequestSchema,
} from "@nuatis/pos-shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { requireManagerPin } from "../../middleware/manager-pin.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import { calculateExpectedCash, writeAuditLog } from "../../lib/db.js";

export const sessionsRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper: extract staff id from JWT (terminal → staff_id, session → user_id)
// ---------------------------------------------------------------------------
function resolveStaffId(req: Request): string {
  const auth = req.auth!;
  return auth.kind === "terminal" ? auth.staff_id : auth.user_id;
}

// ---------------------------------------------------------------------------
// POST /v1/cash/sessions — open a new shift
// ---------------------------------------------------------------------------
sessionsRouter.post("/", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = OpenSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const tenantId = req.auth!.tenant_id;
  const staffId = resolveStaffId(req);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Verify no open session already exists for this location
  const { data: existing } = await db
    .from("cash_drawer_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("location_id", parsed.data.location_id)
    .eq("status", "open")
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: { code: "conflict", message: "A shift is already open for this location. Close the current shift before opening a new one." } });
    return;
  }

  const { data: session, error } = await db
    .from("cash_drawer_sessions")
    .insert({
      tenant_id: tenantId,
      location_id: parsed.data.location_id,
      opened_by_staff_id: staffId,
      opening_float_cents: parsed.data.opening_float_cents,
      status: "open",
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "cash_session_opened", target_type: "cash_drawer_session", target_id: session.id, payload: { opening_float_cents: parsed.data.opening_float_cents }, ip_address: req.ip });

  res.status(201).json(session);
});

// ---------------------------------------------------------------------------
// GET /v1/cash/sessions/current?location_id=... — current open session
// NOTE: must be registered BEFORE /:id to prevent "current" matching as an id
// ---------------------------------------------------------------------------
sessionsRouter.get("/current", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const locationId = req.query["location_id"] as string | undefined;
  if (!locationId) { res.status(400).json({ error: { code: "bad_request", message: "location_id query param is required" } }); return; }

  const tenantId = req.auth!.tenant_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: session, error } = await db
    .from("cash_drawer_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("location_id", locationId)
    .eq("status", "open")
    .maybeSingle();

  if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }
  if (!session) { res.status(404).json({ error: { code: "not_found", message: "No open cash session for this location" } }); return; }

  res.json(session);
});

// ---------------------------------------------------------------------------
// GET /v1/cash/sessions — list sessions (session JWT / owner+manager only)
// ---------------------------------------------------------------------------
sessionsRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const tenantId = req.auth!.tenant_id;
    const locationId = req.query["location_id"] as string | undefined;
    const status = req.query["status"] as string | undefined;
    const limit = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10) || 50, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    let query = db
      .from("cash_drawer_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(limit);

    if (locationId) query = query.eq("location_id", locationId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) { res.status(500).json({ error: { code: "internal_error", message: error.message } }); return; }

    res.json(data ?? []);
  }
);

// ---------------------------------------------------------------------------
// GET /v1/cash/sessions/:id — session detail + events
// ---------------------------------------------------------------------------
sessionsRouter.get("/:id", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const tenantId = req.auth!.tenant_id;
  const sessionId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: session, error: sessionErr } = await db
    .from("cash_drawer_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (sessionErr) { res.status(500).json({ error: { code: "internal_error", message: sessionErr.message } }); return; }
  if (!session) { res.status(404).json({ error: { code: "not_found", message: "Cash session not found" } }); return; }

  const { data: events, error: eventsErr } = await db
    .from("cash_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (eventsErr) { res.status(500).json({ error: { code: "internal_error", message: eventsErr.message } }); return; }

  res.json({ ...session, events: events ?? [] });
});

// ---------------------------------------------------------------------------
// POST /v1/cash/sessions/:id/events — log a cash event
// pay_out and no_sale require manager PIN
// ---------------------------------------------------------------------------
sessionsRouter.post(
  "/:id/events",
  requireAuth(),
  // Conditionally apply manager PIN check before the handler
  (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as { type?: string };
    if (body.type === "pay_out" || body.type === "no_sale") {
      void requireManagerPin()(req, res, next);
      return;
    }
    next();
  },
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

    const parsed = LogCashEventRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

    const tenantId = req.auth!.tenant_id;
    const sessionId = req.params["id"]!;
    const staffId = resolveStaffId(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    const { data: session, error: sessionErr } = await db
      .from("cash_drawer_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (sessionErr) { res.status(500).json({ error: { code: "internal_error", message: sessionErr.message } }); return; }
    if (!session) { res.status(404).json({ error: { code: "not_found", message: "Cash session not found" } }); return; }
    if (session.status !== "open") { res.status(409).json({ error: { code: "conflict", message: "Cannot log events against a closed session" } }); return; }

    const { data: event, error: eventErr } = await db
      .from("cash_events")
      .insert({
        session_id: sessionId,
        type: parsed.data.type,
        amount_cents: parsed.data.amount_cents,
        reason: parsed.data.reason ?? null,
        staff_id: staffId,
      })
      .select()
      .single();

    if (eventErr) { res.status(500).json({ error: { code: "internal_error", message: eventErr.message } }); return; }

    writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "cash_event_logged", target_type: "cash_event", target_id: String(event.id), payload: { type: parsed.data.type, amount_cents: parsed.data.amount_cents }, ip_address: req.ip });

    // Write a separate audit entry when a manager override was used
    if (req.manager_id) {
      writeAuditLog(client, { tenant_id: tenantId, staff_id: req.manager_id, action: "manager_pin_override", target_type: "cash_event", target_id: String(event.id), payload: { original_action: "cash_event_logged", event_type: parsed.data.type, approved_for_staff_id: staffId }, ip_address: req.ip });
    }

    res.status(201).json(event);
  }
);

// ---------------------------------------------------------------------------
// POST /v1/cash/sessions/:id/close — close shift and calculate variance
// ---------------------------------------------------------------------------
sessionsRouter.post("/:id/close", requireAuth(), async (req: Request, res: Response): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) { res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } }); return; }

  const parsed = CloseSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "bad_request", message: "Invalid body", details: parsed.error.flatten() } }); return; }

  const tenantId = req.auth!.tenant_id;
  const staffId = resolveStaffId(req);
  const sessionId = req.params["id"]!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  const { data: session, error: sessionErr } = await db
    .from("cash_drawer_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (sessionErr) { res.status(500).json({ error: { code: "internal_error", message: sessionErr.message } }); return; }
  if (!session) { res.status(404).json({ error: { code: "not_found", message: "Cash session not found" } }); return; }
  if (session.status !== "open") { res.status(409).json({ error: { code: "conflict", message: "Session is already closed" } }); return; }

  // Fetch all events for variance calculation
  const { data: events, error: eventsErr } = await db
    .from("cash_events")
    .select("type, amount_cents")
    .eq("session_id", sessionId);

  if (eventsErr) { res.status(500).json({ error: { code: "internal_error", message: eventsErr.message } }); return; }

  const expected_cents = calculateExpectedCash(
    session.opening_float_cents as number,
    (events ?? []) as { type: string; amount_cents: number }[]
  );
  const variance_cents = parsed.data.closing_actual_cents - expected_cents;

  const { data: closed, error: closeErr } = await db
    .from("cash_drawer_sessions")
    .update({
      closing_actual_cents: parsed.data.closing_actual_cents,
      expected_cents,
      variance_cents,
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (closeErr) { res.status(500).json({ error: { code: "internal_error", message: closeErr.message } }); return; }

  writeAuditLog(client, { tenant_id: tenantId, staff_id: staffId, action: "cash_session_closed", target_type: "cash_drawer_session", target_id: sessionId, payload: { closing_actual_cents: parsed.data.closing_actual_cents, expected_cents, variance_cents }, ip_address: req.ip });

  res.json(closed);
});
