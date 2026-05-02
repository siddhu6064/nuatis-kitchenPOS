import { SignJWT, jwtVerify } from "jose";
import {
  JwtPayloadSchema,
  SESSION_JWT_TTL_SECONDS,
  TERMINAL_JWT_TTL_SECONDS,
  type JwtPayload,
  type SessionJwtPayload,
  type TerminalJwtPayload,
} from "@nuatis/pos-shared";
import { env } from "../env.js";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.POS_JWT_SECRET);
}

interface SignedToken {
  token: string;
  expires_at: string;
}

export async function signSessionJwt(params: {
  tenant_id: string;
  user_id: string;
  role: SessionJwtPayload["role"];
}): Promise<SignedToken> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_JWT_TTL_SECONDS;

  const token = await new SignJWT({
    kind: "session",
    tenant_id: params.tenant_id,
    user_id: params.user_id,
    role: params.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

export async function signTerminalJwt(params: {
  tenant_id: string;
  location_id: string;
  staff_id: string;
}): Promise<SignedToken> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TERMINAL_JWT_TTL_SECONDS;

  const token = await new SignJWT({
    kind: "terminal",
    tenant_id: params.tenant_id,
    location_id: params.location_id,
    staff_id: params.staff_id,
    role: "cashier",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  return JwtPayloadSchema.parse(payload);
}
