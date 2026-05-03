const CLIENT_API = "/api/v1";
const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

export interface ReceiptHistoryEntry {
  id: string;
  order_id: string | null;
  order_number: number | null;
  order_total_cents: number | null;
  channel: "email" | "sms";
  recipient: string;
  status: "queued" | "sent" | "failed" | "bounced";
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ReceiptsHistoryResponse {
  entries: ReceiptHistoryEntry[];
  total_count: number;
}

async function apiFetch<T>(
  path: string,
  posJwt: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${CLIENT_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${posJwt}`,
      ...(init.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    const err = new Error(body?.error?.message ?? `HTTP ${res.status}`);
    (err as Error & { status: number; code: string }).status = res.status;
    (err as Error & { status: number; code: string }).code =
      body?.error?.code ?? "unknown_error";
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface ListReceiptsParams {
  limit?: number;
  offset?: number;
  channel?: "email" | "sms";
  status?: "queued" | "sent" | "failed" | "bounced";
}

export async function getReceiptsHistoryServer(
  posJwt: string,
  params: ListReceiptsParams = {}
): Promise<ReceiptsHistoryResponse | null> {
  try {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    if (params.channel) qs.set("channel", params.channel);
    if (params.status) qs.set("status", params.status);

    const res = await fetch(`${SERVER_API}/v1/receipts?${qs.toString()}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<ReceiptsHistoryResponse>;
  } catch {
    return null;
  }
}

export async function getReceiptsHistory(
  posJwt: string,
  params: ListReceiptsParams = {}
): Promise<ReceiptsHistoryResponse> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.channel) qs.set("channel", params.channel);
  if (params.status) qs.set("status", params.status);
  return apiFetch<ReceiptsHistoryResponse>(`/receipts?${qs.toString()}`, posJwt);
}

export async function resendReceipt(
  posJwt: string,
  orderId: string,
  channel: "email" | "sms",
  recipient: string
): Promise<void> {
  const body = channel === "email"
    ? { email: recipient }
    : { phone: recipient, sms_opt_in: true };

  await apiFetch<void>(`/orders/${orderId}/receipts`, posJwt, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
