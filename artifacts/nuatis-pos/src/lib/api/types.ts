// Copied from @nuatis/pos-shared — keep in sync manually until prototype is
// replaced by production admin app. DO NOT add new schemas here; add them
// upstream in pos-shared and copy.
// Sync banner: updated 2026-05-02 batch 9

import { z } from "zod";

export interface ApiModifierOption {
  id: string;
  name: string;
  price_delta_cents: number;
  sort_order: number;
}

export interface ApiModifierGroup {
  id: string;
  name: string;
  options: ApiModifierOption[];
}

export interface ApiMenuItem {
  id: string;
  name: string;
  price_cents: number;
  category_id: string;
  modifier_groups: ApiModifierGroup[];
}

export interface ApiMenuCategory {
  id: string;
  name: string;
  items: ApiMenuItem[];
}

export interface MenuTreeResponse {
  categories: ApiMenuCategory[];
}

export interface OrderItemResponse {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  qty: number;
  price_cents: number;
  status: string;
}

export interface CheckoutResponse {
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  sales_tax_bps: number;
  items: Array<{ name: string; price_cents: number; qty: number }>;
}

export interface PaymentApiResponse {
  payment: {
    id: string;
    status: string;
    tip_cents: number;
    amount_cents: number;
  };
  order: {
    id: string;
    status: string;
    tip_cents: number;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
  };
}

// ---------------------------------------------------------------------------
// KDS Realtime event schemas — copied from @nuatis/pos-shared
// Used at runtime in realtime.ts to validate incoming broadcast payloads.
// ---------------------------------------------------------------------------

const _uuid = z.string().uuid();
const _isoDate = z.string().datetime();

export const KitchenBroadcastEventSchema = z.object({
  event: z.literal("order_fired"),
  order_id: _uuid,
  location_id: _uuid,
  order_number: z.number().int(),
  opened_at: _isoDate,
  items: z.array(
    z.object({
      id: _uuid,
      name: z.string(),
      quantity: z.number().int().positive(),
      modifiers: z.array(
        z.object({
          group_name: z.string(),
          option_name: z.string(),
        })
      ),
    })
  ),
});
export type KitchenBroadcastEvent = z.infer<typeof KitchenBroadcastEventSchema>;

export const KitchenBumpEventSchema = z.object({
  event: z.literal("item_bumped"),
  order_id: _uuid,
  item_id: _uuid,
});
export type KitchenBumpEvent = z.infer<typeof KitchenBumpEventSchema>;
