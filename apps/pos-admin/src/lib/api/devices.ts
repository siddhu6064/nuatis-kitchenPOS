const CLIENT_API = "/api/v1";

export interface TerminalReader {
  id: string;
  tenant_id: string;
  stripe_reader_id: string;
  label: string;
  location_id: string | null;
  last_seen_at: string | null;
  created_at: string;
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

export async function listDevices(posJwt: string): Promise<TerminalReader[]> {
  return apiFetch<TerminalReader[]>("/terminals", posJwt);
}

export interface RegisterDeviceBody {
  stripe_reader_id: string;
  label: string;
  location_id?: string;
}

export async function registerDevice(
  posJwt: string,
  body: RegisterDeviceBody
): Promise<TerminalReader> {
  return apiFetch<TerminalReader>("/terminals/register", posJwt, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
