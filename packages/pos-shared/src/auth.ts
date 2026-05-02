import { z } from "zod";
import { EmailSchema, PasswordSchema, PinSchema } from "./staff.js";

export const JwtKindSchema = z.enum(["session", "terminal"]);

export const SessionJwtPayloadSchema = z.object({
  kind: z.literal("session"),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["owner", "manager"]),
  iat: z.number(),
  exp: z.number(),
});
export type SessionJwtPayload = z.infer<typeof SessionJwtPayloadSchema>;

export const TerminalJwtPayloadSchema = z.object({
  kind: z.literal("terminal"),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  role: z.literal("cashier"),
  iat: z.number(),
  exp: z.number(),
});
export type TerminalJwtPayload = z.infer<typeof TerminalJwtPayloadSchema>;

export const JwtPayloadSchema = z.discriminatedUnion("kind", [
  SessionJwtPayloadSchema,
  TerminalJwtPayloadSchema,
]);
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// Sign-in (email + password — owner/manager only)
export const SignInRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

export const SignInResponseSchema = z.object({
  token: z.string(),
  expires_at: z.string().datetime(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    role: z.enum(["owner", "manager"]),
    tenant_id: z.string().uuid(),
  }),
});
export type SignInResponse = z.infer<typeof SignInResponseSchema>;

// PIN sign-in (cashier only)
export const PinRequestSchema = z.object({
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  pin: PinSchema,
});
export type PinRequest = z.infer<typeof PinRequestSchema>;

export const PinResponseSchema = z.object({
  token: z.string(),
  expires_at: z.string().datetime(),
  staff: z.object({
    id: z.string().uuid(),
    full_name: z.string(),
    role: z.literal("cashier"),
    tenant_id: z.string().uuid(),
    location_id: z.string().uuid(),
  }),
});
export type PinResponse = z.infer<typeof PinResponseSchema>;
