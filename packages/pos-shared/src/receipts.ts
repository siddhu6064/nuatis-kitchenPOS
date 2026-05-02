import { z } from "zod";

// ---------------------------------------------------------------------------
// Request / Response schemas
// ---------------------------------------------------------------------------

export const SendReceiptRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{1,14}$/, "Phone must be in E.164 format")
      .optional(),
    sms_opt_in: z.boolean().default(false),
    sms_opt_in_text: z.string().optional(),
  })
  .refine((d) => d.email ?? d.phone, {
    message: "Must provide at least one of email or phone",
  });
export type SendReceiptRequest = z.infer<typeof SendReceiptRequestSchema>;

export const SendReceiptResponseSchema = z.object({
  jobs_enqueued: z.array(z.enum(["email", "sms"])),
  receipt_token: z.string(),
});
export type SendReceiptResponse = z.infer<typeof SendReceiptResponseSchema>;

// ---------------------------------------------------------------------------
// Public receipt view schema (returned by GET /r/:token)
// ---------------------------------------------------------------------------

export const ReceiptItemSchema = z.object({
  name: z.string(),
  qty: z.number().int(),
  price_cents: z.number().int(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptViewSchema = z.object({
  order_id: z.string().uuid(),
  order_number: z.number().int().nullable(),
  opened_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  subtotal_cents: z.number().int(),
  tax_cents: z.number().int(),
  tip_cents: z.number().int(),
  total_cents: z.number().int(),
  items: z.array(ReceiptItemSchema),
  payment_method: z.string().nullable(),
  last4: z.string().nullable(),
  tenant_name: z.string(),
  location_name: z.string(),
  location_address: z.unknown().nullable(),
});
export type ReceiptView = z.infer<typeof ReceiptViewSchema>;
