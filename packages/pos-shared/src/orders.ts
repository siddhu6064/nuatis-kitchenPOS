import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().datetime();
const nullableDate = isoDate.nullable();
const nonNegInt = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const OrderStatusSchema = z.enum(["open", "fired", "paid", "voided"]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderItemStatusSchema = z.enum(["open", "fired", "bumped", "voided"]);
export type OrderItemStatus = z.infer<typeof OrderItemStatusSchema>;

export const PaymentStatusSchema = z.enum([
  "requires_payment_method",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "voided",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentMethodSchema = z.enum([
  "cash",
  "card_mock",
  "card_present",
  "card_not_present",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------
export const OrderSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  location_id: uuid,
  opened_by_staff_id: uuid,
  status: OrderStatusSchema,
  vertical: z.string(),
  subtotal_cents: nonNegInt,
  tax_cents: nonNegInt,
  tip_cents: nonNegInt,
  total_cents: nonNegInt,
  voided_at: nullableDate,
  opened_at: isoDate,
  closed_at: nullableDate,
  updated_at: isoDate,
});
export type Order = z.infer<typeof OrderSchema>;

// ---------------------------------------------------------------------------
// OrderItem — matches DB columns (qty, name_snapshot, fired_at, modifiers_json)
// ---------------------------------------------------------------------------
export const OrderItemSchema = z.object({
  id: uuid,
  order_id: uuid,
  tenant_id: uuid,
  menu_item_id: uuid.nullable(),
  name_snapshot: z.string(),
  qty: z.number().int().positive(),
  price_cents: nonNegInt,
  modifiers_json: z.unknown().nullable(),
  status: OrderItemStatusSchema,
  fired_at: nullableDate,
  voided_at: nullableDate,
  created_at: isoDate,
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------
export const PaymentSchema = z.object({
  id: uuid,
  order_id: uuid,
  tenant_id: uuid,
  stripe_payment_intent_id: z.string().nullable(),
  amount_cents: nonNegInt,
  tip_cents: nonNegInt,
  status: PaymentStatusSchema,
  method: PaymentMethodSchema,
  created_at: isoDate,
  updated_at: isoDate,
});
export type Payment = z.infer<typeof PaymentSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------
export const CreateOrderRequestSchema = z.object({
  location_id: uuid,
  staff_id: uuid.optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const AddOrderItemRequestSchema = z.object({
  menu_item_id: uuid,
  quantity: z.number().int().positive().default(1),
  modifiers: z
    .array(z.object({ group_id: uuid, option_id: uuid }))
    .default([]),
});
export type AddOrderItemRequest = z.infer<typeof AddOrderItemRequestSchema>;

export const CheckoutResponseSchema = z.object({
  subtotal_cents: nonNegInt,
  tax_cents: nonNegInt,
  tip_cents: nonNegInt,
  total_cents: nonNegInt,
  sales_tax_bps: z.number().int(),
  items: z.array(
    z.object({ name: z.string(), price_cents: nonNegInt, qty: z.number().int() })
  ),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const CreatePaymentRequestSchema = z.object({
  method: PaymentMethodSchema,
  tip_cents: nonNegInt.default(0),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

export const VoidOrderRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type VoidOrderRequest = z.infer<typeof VoidOrderRequestSchema>;
