import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CashEventTypeSchema = z.enum([
  "pay_in",
  "pay_out",
  "no_sale",
  "cash_sale",
  "cash_refund",
]);
export type CashEventType = z.infer<typeof CashEventTypeSchema>;

export const CashSessionStatusSchema = z.enum(["open", "closed"]);
export type CashSessionStatus = z.infer<typeof CashSessionStatusSchema>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const CashSessionSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid(),
  opened_by_staff_id: z.string().uuid(),
  opening_float_cents: z.number().int(),
  closing_actual_cents: z.number().int().nullable(),
  expected_cents: z.number().int().nullable(),
  variance_cents: z.number().int().nullable(),
  status: CashSessionStatusSchema,
  opened_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
});
export type CashSession = z.infer<typeof CashSessionSchema>;

export const CashEventSchema = z.object({
  id: z.number().int(),
  session_id: z.string().uuid(),
  type: CashEventTypeSchema,
  amount_cents: z.number().int(),
  reason: z.string().nullable(),
  staff_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
});
export type CashEvent = z.infer<typeof CashEventSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const OpenSessionRequestSchema = z.object({
  location_id: z.string().uuid(),
  opening_float_cents: z.number().int().nonnegative(),
});
export type OpenSessionRequest = z.infer<typeof OpenSessionRequestSchema>;

export const LogCashEventRequestSchema = z.object({
  type: CashEventTypeSchema,
  amount_cents: z.number().int(),
  reason: z.string().min(1).max(500).optional(),
});
export type LogCashEventRequest = z.infer<typeof LogCashEventRequestSchema>;

export const CloseSessionRequestSchema = z.object({
  closing_actual_cents: z.number().int().nonnegative(),
});
export type CloseSessionRequest = z.infer<typeof CloseSessionRequestSchema>;

export const ManagerPinOverrideSchema = z.object({
  manager_pin: z.string().regex(/^\d{4}$/),
});
export type ManagerPinOverride = z.infer<typeof ManagerPinOverrideSchema>;
