import { z } from "zod";

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format required");

export const PaymentMethodBreakdownSchema = z.object({
  method: z.enum(["card_present", "card_not_present", "cash", "card_mock"]),
  count: z.number().int(),
  gross_cents: z.number().int(),
});

export const ItemBreakdownSchema = z.object({
  menu_item_id: z.string().uuid().nullable(),
  name: z.string(),
  qty_sold: z.number().int(),
  gross_cents: z.number().int(),
  pct_of_total: z.number(),
});

export const StaffBreakdownSchema = z.object({
  staff_id: z.string().uuid(),
  full_name: z.string(),
  ticket_count: z.number().int(),
  gross_cents: z.number().int(),
  tips_cents: z.number().int(),
});

export const EndOfDayReportSchema = z.object({
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  date: DateStringSchema,
  is_snapshot: z.boolean(),
  snapshot_at: z.string().datetime().nullable(),
  gross_sales_cents: z.number().int(),
  taxable_cents: z.number().int(),
  tax_cents: z.number().int(),
  tips_cents: z.number().int(),
  discounts_cents: z.number().int(),
  voids_cents: z.number().int(),
  refunds_cents: z.number().int(),
  net_cents: z.number().int(),
  order_count: z.number().int(),
  paid_order_count: z.number().int(),
  voided_order_count: z.number().int(),
  by_method: z.array(PaymentMethodBreakdownSchema),
  by_item: z.array(ItemBreakdownSchema),
  by_staff: z.array(StaffBreakdownSchema),
});

export const GetEndOfDayQuerySchema = z.object({
  date: DateStringSchema,
  location_id: z.string().uuid().optional(),
});

export const ReportSummarySchema = z.object({
  date: DateStringSchema,
  gross_sales_cents: z.number().int(),
  net_cents: z.number().int(),
  order_count: z.number().int(),
});

export type DateString = z.infer<typeof DateStringSchema>;
export type PaymentMethodBreakdown = z.infer<typeof PaymentMethodBreakdownSchema>;
export type ItemBreakdown = z.infer<typeof ItemBreakdownSchema>;
export type StaffBreakdown = z.infer<typeof StaffBreakdownSchema>;
export type EndOfDayReport = z.infer<typeof EndOfDayReportSchema>;
export type GetEndOfDayQuery = z.infer<typeof GetEndOfDayQuerySchema>;
export type ReportSummary = z.infer<typeof ReportSummarySchema>;
