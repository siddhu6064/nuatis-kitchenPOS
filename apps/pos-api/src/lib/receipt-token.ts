import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

const RECEIPT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function getSecret(): Uint8Array {
  // Fall back to POS_JWT_SECRET when RECEIPT_TOKEN_SECRET is not set.
  // In production, set RECEIPT_TOKEN_SECRET independently so receipt tokens
  // can be rotated without invalidating staff session tokens.
  const secret = env.RECEIPT_TOKEN_SECRET ?? env.POS_JWT_SECRET;
  return new TextEncoder().encode(secret);
}

export interface ReceiptTokenPayload {
  kind: "receipt";
  order_id: string;
  tenant_id: string;
  iat: number;
  exp: number;
}

export async function signReceiptToken(
  order_id: string,
  tenant_id: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ kind: "receipt", order_id, tenant_id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + RECEIPT_TOKEN_TTL_SECONDS)
    .sign(getSecret());
}

export async function verifyReceiptToken(
  token: string
): Promise<ReceiptTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  if (payload["kind"] !== "receipt") {
    throw new Error("Invalid token kind");
  }
  return payload as unknown as ReceiptTokenPayload;
}
