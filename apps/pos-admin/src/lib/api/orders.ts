import type { Order, OrderItem, Payment } from "@nuatis/pos-shared";

const CLIENT_API = "/api/v1";

export interface AuditEntry {
  id: number;
  staff_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  ip_address: string | null;
  created_at: string;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  payments: Payment[];
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

export async function listOrders(
  posJwt: string,
  params: { location_id?: string; status?: string; limit?: number } = {}
): Promise<Order[]> {
  const qs = new URLSearchParams();
  if (params.location_id) qs.set("location_id", params.location_id);
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<Order[]>(`/orders${query}`, posJwt);
}

export async function getOrder(
  posJwt: string,
  id: string
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${id}`, posJwt);
}

export async function getOrderAuditTrail(
  posJwt: string,
  id: string
): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>(`/orders/${id}/audit-trail`, posJwt);
}

export async function voidOrder(
  posJwt: string,
  id: string,
  reason: string
): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/void`, posJwt, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function resendReceipt(
  posJwt: string,
  orderId: string,
  channel: "email" | "sms"
): Promise<void> {
  await apiFetch<void>(`/orders/${orderId}/receipts`, posJwt, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export async function listLocations(posJwt: string): Promise<Location[]> {
  return apiFetch<Location[]>(`/locations`, posJwt);
}

export interface RefundResult {
  payment: unknown;
  refund: {
    id: string;
    amount_cents: number;
    reason: string;
    stripe_refund_id: string | null;
    created_at: string;
  };
}

export async function refundPayment(
  posJwt: string,
  paymentId: string,
  reason: string
): Promise<RefundResult> {
  return apiFetch<RefundResult>(`/payments/${paymentId}/refund`, posJwt, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
