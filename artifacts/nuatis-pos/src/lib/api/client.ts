const API_BASE: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  "http://localhost:3002";

const JWT_KEY = "pos.jwt";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setJwt(token: string): void {
  sessionStorage.setItem(JWT_KEY, token);
}

export function clearJwt(): void {
  sessionStorage.removeItem(JWT_KEY);
  sessionStorage.removeItem("pos.staff_name");
  sessionStorage.removeItem("pos.staff_id");
  sessionStorage.removeItem("pos.location_id");
}

export function getJwt(): string | null {
  return sessionStorage.getItem(JWT_KEY);
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const jwt = getJwt();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let code = "unknown_error";
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T, B = unknown>(path: string, body: B): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function del(path: string): Promise<void> {
  return request<void>(path, { method: "DELETE" });
}
