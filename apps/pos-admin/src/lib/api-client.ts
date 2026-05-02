import type { Session } from "next-auth";

const POS_API_URL = process.env["POS_API_URL"] ?? "http://localhost:3002";

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

function authHeaders(session: Session | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.user?.posJwt) {
    headers["Authorization"] = `Bearer ${session.user.posJwt}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
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
      // ignore
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiGet<T>(
  path: string,
  session: Session | null,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${POS_API_URL}${path}`, {
    ...options,
    headers: authHeaders(session),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

export async function apiPost<T, B = unknown>(
  path: string,
  body: B,
  session: Session | null
): Promise<T> {
  const res = await fetch(`${POS_API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T, B = unknown>(
  path: string,
  body: B,
  session: Session | null
): Promise<T> {
  const res = await fetch(`${POS_API_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete(
  path: string,
  session: Session | null
): Promise<void> {
  const res = await fetch(`${POS_API_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(session),
  });
  await handleResponse<void>(res);
}

/** Public (no-auth) POST — used for sign-up */
export async function publicPost<T, B = unknown>(
  path: string,
  body: B
): Promise<T> {
  const res = await fetch(`${POS_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}
