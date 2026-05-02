import { useState, useEffect } from "react";
import type { MenuItem } from "@/data/menu";

const STORAGE_KEY = "nuatis_pos_cart_v1";
const TAX_RATE = 0.0825;

export interface CartLine {
  item: MenuItem;
  qty: number;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  grandTotal: number;
}

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartLine[];
  } catch {
    return [];
  }
}

function saveCart(lines: CartLine[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(loadCart);

  useEffect(() => {
    saveCart(lines);
  }, [lines]);

  function addItem(item: MenuItem) {
    setLines((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { item, qty: 1 }];
    });
  }

  function incrementItem(id: string) {
    setLines((prev) =>
      prev.map((l) => (l.item.id === id ? { ...l, qty: l.qty + 1 } : l))
    );
  }

  function decrementItem(id: string) {
    setLines((prev) => {
      const line = prev.find((l) => l.item.id === id);
      if (!line) return prev;
      if (line.qty <= 1) return prev.filter((l) => l.item.id !== id);
      return prev.map((l) => (l.item.id === id ? { ...l, qty: l.qty - 1 } : l));
    });
  }

  function removeItem(id: string) {
    setLines((prev) => prev.filter((l) => l.item.id !== id));
  }

  function clearCart() {
    setLines([]);
  }

  const subtotal = lines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  const tax = subtotal * TAX_RATE;
  const grandTotal = subtotal + tax;
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  const totals: CartTotals = { subtotal, tax, grandTotal };

  return { lines, addItem, incrementItem, decrementItem, removeItem, clearCart, totals, itemCount };
}
