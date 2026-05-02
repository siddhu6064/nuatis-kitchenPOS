// Copied from @nuatis/pos-shared on 2026-05-02 — keep in sync manually until
// prototype is replaced by production admin app. DO NOT add new schemas here;
// add them upstream and copy.

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
