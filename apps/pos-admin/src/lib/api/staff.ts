const CLIENT_API = "/api/v1";

export interface StaffMember {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string | null;
  role: "owner" | "manager" | "cashier";
  active: boolean;
  location_ids: string[] | null;
  has_pin: boolean;
  created_at: string;
}

export interface InviteStaffPayload {
  full_name: string;
  email?: string;
  role: "owner" | "manager" | "cashier";
  pin?: string;
  location_ids?: string[];
}

export interface UpdateStaffPayload {
  full_name?: string;
  email?: string;
  role?: "owner" | "manager" | "cashier";
  pin?: string;
  location_ids?: string[];
  active?: boolean;
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

export async function getStaff(posJwt: string): Promise<StaffMember[]> {
  return apiFetch<StaffMember[]>("/staff", posJwt);
}

export async function createStaff(
  posJwt: string,
  data: InviteStaffPayload
): Promise<StaffMember> {
  return apiFetch<StaffMember>("/staff", posJwt, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateStaff(
  posJwt: string,
  id: string,
  data: UpdateStaffPayload
): Promise<StaffMember> {
  return apiFetch<StaffMember>(`/staff/${id}`, posJwt, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deactivateStaff(
  posJwt: string,
  id: string
): Promise<void> {
  return apiFetch<void>(`/staff/${id}`, posJwt, { method: "DELETE" });
}
