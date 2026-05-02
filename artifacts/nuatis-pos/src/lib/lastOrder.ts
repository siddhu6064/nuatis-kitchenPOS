import type { CartLine } from "@/hooks/useCart";

const LAST_ORDER_KEY = "nuatis_pos_last_order_v1";

export interface LastOrder {
  items: Array<{ id: string; name: string; price: number; qty: number }>;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  timestamp: string;
}

export function saveLastOrder(lines: CartLine[], subtotal: number, tax: number, tip: number, total: number): void {
  const order: LastOrder = {
    items: lines.map((l) => ({
      id: l.item.id,
      name: l.item.name,
      price: l.item.price,
      qty: l.qty,
    })),
    subtotal,
    tax,
    tip,
    total,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
}

export function loadLastOrder(): LastOrder | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastOrder;
  } catch {
    return null;
  }
}

export function clearLastOrder(): void {
  localStorage.removeItem(LAST_ORDER_KEY);
}
