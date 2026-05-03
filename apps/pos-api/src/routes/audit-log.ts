import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role-guard.js";
import { getSupabaseClient } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

export const auditLogRouter: IRouter = Router();
export const auditLogCsvRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  occurred_at: string;
  action_type: string;
  staff_id: string | null;
  staff_name: string | null;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  ip_address: string | null;
}

// ---------------------------------------------------------------------------
// Cursor helpers — base64url(occurred_at|id) for stable pagination under
// same-timestamp entries.
// ---------------------------------------------------------------------------

function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;
    const occurredAt = decoded.slice(0, pipeIdx);
    const id = decoded.slice(pipeIdx + 1);
    if (!occurredAt || !id) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const AuditLogQuerySchema = z.object({
  action_type: z.string().optional(),
  staff_id: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Shared DB fetch — returns raw rows + a staff-name lookup map
// ---------------------------------------------------------------------------

async function fetchRows(
  tenantId: string,
  params: z.infer<typeof AuditLogQuerySchema>,
  rowLimit: number
): Promise<{ rows: Array<Record<string, unknown>>; staffMap: Map<string, string> }> {
  const client = getSupabaseClient();
  if (!client) return { rows: [], staffMap: new Map() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  let query = db
    .from("audit_log")
    .select("id, occurred_at, action, staff_id, target_type, target_id, payload, ip_address")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(rowLimit);

  if (params.action_type) query = query.eq("action", params.action_type);
  if (params.staff_id) query = query.eq("staff_id", params.staff_id);

  if (params.from) {
    query = query.gte("occurred_at", `${params.from}T00:00:00.000Z`);
  }
  if (params.to) {
    // Include the full to-day by setting the upper bound to the start of the next day.
    const toDate = new Date(`${params.to}T00:00:00.000Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    query = query.lt("occurred_at", toDate.toISOString());
  }

  if (params.cursor) {
    const cursorData = decodeCursor(params.cursor);
    if (cursorData) {
      // (occurred_at, id) < (cursor_occurred_at, cursor_id) with DESC ordering
      query = query.or(
        `occurred_at.lt.${cursorData.occurredAt},and(occurred_at.eq.${cursorData.occurredAt},id.lt.${cursorData.id})`
      );
    }
  }

  const { data: rows, error } = await query;

  if (error) {
    logger.error({ err: error }, "audit_log query failed");
    return { rows: [], staffMap: new Map() };
  }

  // Build staff-name map from the returned staff_ids
  const rawRows = (rows ?? []) as Array<Record<string, unknown>>;
  const staffIds = [
    ...new Set(
      rawRows.map((r) => r["staff_id"]).filter((id): id is string => typeof id === "string")
    ),
  ];

  const staffMap = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await db
      .from("staff_members")
      .select("id, full_name")
      .in("id", staffIds);

    for (const s of (staffRows ?? []) as Array<{ id: string; full_name: string }>) {
      staffMap.set(s.id, s.full_name);
    }
  }

  return { rows: rawRows, staffMap };
}

// Fetch distinct action values for the tenant (for dropdown population)
async function fetchDistinctActions(tenantId: string): Promise<string[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { data } = await db
    .from("audit_log")
    .select("action")
    .eq("tenant_id", tenantId)
    .order("action");

  return [...new Set(((data ?? []) as Array<{ action: string }>).map((r) => r.action))];
}

function mapRow(row: Record<string, unknown>, staffMap: Map<string, string>): AuditEntry {
  const staffId = typeof row["staff_id"] === "string" ? row["staff_id"] : null;
  return {
    id: row["id"] as string,
    occurred_at: row["occurred_at"] as string,
    action_type: row["action"] as string,
    staff_id: staffId,
    staff_name: staffId ? (staffMap.get(staffId) ?? null) : null,
    target_type: typeof row["target_type"] === "string" ? row["target_type"] : null,
    target_id: typeof row["target_id"] === "string" ? row["target_id"] : null,
    payload: row["payload"] ?? null,
    ip_address: typeof row["ip_address"] === "string" ? row["ip_address"] : null,
  };
}

// ---------------------------------------------------------------------------
// GET /v1/audit-log — paginated JSON, owner + manager
// ---------------------------------------------------------------------------

auditLogRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner", "manager"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = AuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid query params", details: parsed.error.flatten() },
      });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    const { limit } = parsed.data;

    // Fetch limit+1 rows to detect whether a next page exists
    const [{ rows, staffMap }, distinctActionTypes] = await Promise.all([
      fetchRows(tenantId, parsed.data, limit + 1),
      fetchDistinctActions(tenantId),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const entries = pageRows.map((r) => mapRow(r, staffMap));

    let next_cursor: string | null = null;
    if (hasMore) {
      const last = entries[entries.length - 1]!;
      next_cursor = encodeCursor(last.occurred_at, last.id);
    }

    res.json({ entries, next_cursor, distinct_action_types: distinctActionTypes });
  }
);

// ---------------------------------------------------------------------------
// GET /v1/audit-log.csv — CSV export, owner only
// ---------------------------------------------------------------------------

const CSV_HEADER =
  "id,occurred_at,action_type,staff_id,staff_name,target_type,target_id,ip_address,payload";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsvLine(e: AuditEntry): string {
  return [
    e.id,
    e.occurred_at,
    e.action_type,
    e.staff_id ?? "",
    e.staff_name ?? "",
    e.target_type ?? "",
    e.target_id ?? "",
    e.ip_address ?? "",
    e.payload,
  ]
    .map(escapeCsv)
    .join(",");
}

auditLogCsvRouter.get(
  "/",
  requireAuth({ kinds: ["session"] }),
  requireRole(["owner"]),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const parsed = AuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid query params", details: parsed.error.flatten() },
      });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    // Export up to 5 000 rows — no cursor for CSV
    const { rows, staffMap } = await fetchRows(tenantId, { ...parsed.data, cursor: undefined }, 5_000);
    const entries = rows.map((r) => mapRow(r, staffMap));
    const csv = [CSV_HEADER, ...entries.map(rowToCsvLine)].join("\n");

    const dateStr = new Intl.DateTimeFormat("en-CA").format(new Date());
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${dateStr}.csv"`);
    res.send(csv);
  }
);
