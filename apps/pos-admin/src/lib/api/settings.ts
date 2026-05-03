const CLIENT_API = "/api/v1";

export interface TenantSettings {
  id: string;
  name: string;
  vertical: string;
  timezone: string;
  email_daily_report: boolean;
  daily_report_recipient_email: string | null;
}

export interface LocationSettings {
  id: string;
  tenant_id: string;
  name: string;
  sales_tax_bps: number;
  business_hours: unknown;
  address: unknown;
}

export interface SettingsData {
  tenant: TenantSettings;
  locations: LocationSettings[];
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

const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

export async function getSettingsServer(posJwt: string): Promise<SettingsData | null> {
  try {
    const res = await fetch(`${SERVER_API}/v1/settings`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<SettingsData>;
  } catch {
    return null;
  }
}

export async function updateTenantSettings(
  posJwt: string,
  data: Partial<Omit<TenantSettings, "id" | "vertical">>
): Promise<TenantSettings> {
  return apiFetch<TenantSettings>("/settings/tenant", posJwt, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function updateLocationSettings(
  posJwt: string,
  locationId: string,
  data: Partial<Omit<LocationSettings, "id" | "tenant_id">>
): Promise<LocationSettings> {
  return apiFetch<LocationSettings>(`/settings/locations/${locationId}`, posJwt, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
