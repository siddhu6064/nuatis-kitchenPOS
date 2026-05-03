const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";
const CLIENT_API = "/api/v1";

export interface AuditEntry {
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

export interface AuditLogResponse {
  entries: AuditEntry[];
  next_cursor: string | null;
  distinct_action_types: string[];
}

export interface AuditLogParams {
  action_type?: string;
  staff_id?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function buildQs(params: AuditLogParams): string {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 50) });
  if (params.action_type) qs.set("action_type", params.action_type);
  if (params.staff_id) qs.set("staff_id", params.staff_id);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.cursor) qs.set("cursor", params.cursor);
  return qs.toString();
}

/** Server-side fetch (Next.js server components) */
export async function getAuditLogServer(
  posJwt: string,
  params: AuditLogParams = {}
): Promise<AuditLogResponse> {
  const res = await fetch(`${SERVER_API}/v1/audit-log?${buildQs(params)}`, {
    headers: { Authorization: `Bearer ${posJwt}` },
    cache: "no-store",
  });
  if (!res.ok) return { entries: [], next_cursor: null, distinct_action_types: [] };
  return res.json() as Promise<AuditLogResponse>;
}

/** Client-side fetch (browser, passes through Next.js API proxy) */
export async function getAuditLog(
  posJwt: string,
  params: AuditLogParams = {}
): Promise<AuditLogResponse> {
  const res = await fetch(`${CLIENT_API}/audit-log?${buildQs(params)}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${posJwt}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return { entries: [], next_cursor: null, distinct_action_types: [] };
  return res.json() as Promise<AuditLogResponse>;
}

/** Build the CSV export URL with current filter state (browser navigation) */
export function buildCsvExportUrl(params: AuditLogParams): string {
  const qs = new URLSearchParams();
  if (params.action_type) qs.set("action_type", params.action_type);
  if (params.staff_id) qs.set("staff_id", params.staff_id);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return `/api/v1/audit-log.csv?${qs.toString()}`;
}
