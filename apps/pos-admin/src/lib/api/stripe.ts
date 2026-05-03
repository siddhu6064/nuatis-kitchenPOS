const CLIENT_API = "/api/v1";
const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

export interface StripeStatus {
  stripe_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_currently_due: string[];
}

export interface OnboardingLinkResponse {
  url: string;
  expires_at: string;
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

export async function getStripeStatusServer(posJwt: string): Promise<StripeStatus | null> {
  try {
    const res = await fetch(`${SERVER_API}/v1/stripe/onboarding/status`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<StripeStatus>;
  } catch {
    return null;
  }
}

export async function startStripeOnboarding(posJwt: string): Promise<OnboardingLinkResponse> {
  return apiFetch<OnboardingLinkResponse>("/stripe/onboarding/start", posJwt, {
    method: "POST",
  });
}

export async function listStripeReaders(posJwt: string): Promise<unknown[]> {
  return apiFetch<unknown[]>("/stripe/terminal/readers", posJwt);
}
