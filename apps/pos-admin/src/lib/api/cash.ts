import type { CashSession, CashEvent, CashEventType } from "@nuatis/pos-shared";

const CLIENT_API = "/api/v1";

export interface CashSessionWithEvents extends CashSession {
  events: CashEvent[];
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function getCurrentSession(
  posJwt: string,
  locationId: string
): Promise<CashSessionWithEvents | null> {
  const res = await fetch(
    `${CLIENT_API}/cash/sessions/current?location_id=${locationId}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${posJwt}`,
      },
      cache: "no-store",
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const session = (await res.json()) as CashSession;
  // Fetch full session details (includes events)
  return getSession(posJwt, session.id);
}

export async function getSession(
  posJwt: string,
  sessionId: string
): Promise<CashSessionWithEvents> {
  return apiFetch<CashSessionWithEvents>(
    `/cash/sessions/${sessionId}`,
    posJwt
  );
}

export async function logCashEvent(
  posJwt: string,
  sessionId: string,
  params: { type: CashEventType; amount_cents: number; reason?: string },
  managerPin?: string
): Promise<CashEvent> {
  const body: Record<string, unknown> = {
    type: params.type,
    amount_cents: params.amount_cents,
  };
  if (params.reason) body["reason"] = params.reason;
  if (managerPin) body["manager_pin"] = managerPin;

  return apiFetch<CashEvent>(`/cash/sessions/${sessionId}/events`, posJwt, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function closeSession(
  posJwt: string,
  sessionId: string,
  closingActualCents: number
): Promise<CashSession> {
  return apiFetch<CashSession>(`/cash/sessions/${sessionId}/close`, posJwt, {
    method: "POST",
    body: JSON.stringify({ closing_actual_cents: closingActualCents }),
  });
}
