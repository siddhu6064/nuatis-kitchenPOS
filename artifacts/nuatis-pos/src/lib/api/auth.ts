import { post, setJwt, clearJwt } from "./client";

interface PinSignInResponse {
  token: string;
  expires_at: string;
  staff: {
    id: string;
    full_name: string;
    role: string;
    tenant_id: string;
    location_id: string;
  };
}

export async function signInWithPin(
  tenant_id: string,
  location_id: string,
  pin: string
): Promise<PinSignInResponse> {
  const res = await post<PinSignInResponse>("/v1/auth/pin", {
    tenant_id,
    location_id,
    pin,
  });
  setJwt(res.token);
  sessionStorage.setItem("pos.staff_name", res.staff.full_name);
  sessionStorage.setItem("pos.staff_id", res.staff.id);
  sessionStorage.setItem("pos.location_id", res.staff.location_id);
  return res;
}

export function signOut(): void {
  clearJwt();
}
