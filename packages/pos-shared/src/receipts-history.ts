import { z } from "zod";

export const ReceiptStatusSchema = z.enum(["queued", "sent", "failed", "bounced"]);
export type ReceiptStatus = z.infer<typeof ReceiptStatusSchema>;

export const ReceiptHistoryEntrySchema = z.object({
  id: z.string(),
  order_id: z.string().uuid().nullable(),
  order_number: z.number().int().nullable(),
  order_total_cents: z.number().int().nullable(),
  channel: z.enum(["email", "sms"]),
  recipient: z.string(),
  status: ReceiptStatusSchema,
  provider_message_id: z.string().nullable(),
  error: z.string().nullable(),
  sent_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type ReceiptHistoryEntry = z.infer<typeof ReceiptHistoryEntrySchema>;

export const ReceiptHistoryResponseSchema = z.object({
  entries: z.array(ReceiptHistoryEntrySchema),
  total_count: z.number().int(),
});
export type ReceiptHistoryResponse = z.infer<typeof ReceiptHistoryResponseSchema>;

export const ListReceiptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  channel: z.enum(["email", "sms"]).optional(),
  status: ReceiptStatusSchema.optional(),
});
export type ListReceiptsQuery = z.infer<typeof ListReceiptsQuerySchema>;
