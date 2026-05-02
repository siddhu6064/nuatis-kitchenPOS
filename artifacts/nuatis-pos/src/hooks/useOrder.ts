import { useState, useCallback } from "react";
import type { CartLine, CartTotals } from "./useCart";
import type { ApiMenuItem } from "@/lib/api/types";
import {
  createOrder,
  addOrderItem,
  voidOrderItem,
  createPayment,
  sendToKitchen as sendToKitchenApi,
} from "@/lib/api/orders";
import type { PaymentApiResponse } from "@/lib/api/types";

interface ApiLine {
  menuItemId: string;
  orderItemIds: string[];
  name: string;
  price_cents: number;
  qty: number;
}

const TAX_RATE = 0.0825;

const DEMO_LOCATION =
  (import.meta.env["VITE_DEMO_LOCATION_ID"] as string | undefined) ??
  "00000000-0000-0000-0000-000000000010";

export function useOrder() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [apiLines, setApiLines] = useState<ApiLine[]>([]);
  const [isMutating, setIsMutating] = useState(false);

  const lines: CartLine[] = apiLines.map((l) => ({
    item: {
      id: l.menuItemId,
      name: l.name,
      price: l.price_cents / 100,
      category: "coffee" as const,
    },
    qty: l.qty,
  }));

  const subtotal = apiLines.reduce(
    (sum, l) => sum + (l.price_cents / 100) * l.qty,
    0
  );
  const tax = subtotal * TAX_RATE;
  const grandTotal = subtotal + tax;
  const totals: CartTotals = { subtotal, tax, grandTotal };
  const itemCount = apiLines.reduce((sum, l) => sum + l.qty, 0);

  const locationId =
    sessionStorage.getItem("pos.location_id") ?? DEMO_LOCATION;
  const staffId = sessionStorage.getItem("pos.staff_id") ?? undefined;

  async function ensureOrder(): Promise<string> {
    if (orderId) return orderId;
    const order = await createOrder(locationId, staffId);
    setOrderId(order.id);
    return order.id;
  }

  const addItem = useCallback(
    async (apiItem: ApiMenuItem): Promise<void> => {
      setIsMutating(true);
      try {
        const oid = await ensureOrder();
        const newItem = await addOrderItem(oid, apiItem.id, 1);
        setApiLines((prev) => {
          const existing = prev.find((l) => l.menuItemId === apiItem.id);
          if (existing) {
            return prev.map((l) =>
              l.menuItemId === apiItem.id
                ? { ...l, orderItemIds: [...l.orderItemIds, newItem.id], qty: l.qty + 1 }
                : l
            );
          }
          return [
            ...prev,
            {
              menuItemId: apiItem.id,
              orderItemIds: [newItem.id],
              name: apiItem.name,
              price_cents: apiItem.price_cents,
              qty: 1,
            },
          ];
        });
      } catch (err) {
        console.error("addItem failed:", err);
      } finally {
        setIsMutating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId]
  );

  const incrementItem = useCallback(
    async (menuItemId: string): Promise<void> => {
      const line = apiLines.find((l) => l.menuItemId === menuItemId);
      if (!line || !orderId) return;
      setIsMutating(true);
      try {
        const newItem = await addOrderItem(orderId, menuItemId, 1);
        setApiLines((prev) =>
          prev.map((l) =>
            l.menuItemId === menuItemId
              ? { ...l, orderItemIds: [...l.orderItemIds, newItem.id], qty: l.qty + 1 }
              : l
          )
        );
      } catch (err) {
        console.error("incrementItem failed:", err);
      } finally {
        setIsMutating(false);
      }
    },
    [apiLines, orderId]
  );

  const decrementItem = useCallback(
    async (menuItemId: string): Promise<void> => {
      const line = apiLines.find((l) => l.menuItemId === menuItemId);
      if (!line || !orderId) return;
      setIsMutating(true);
      try {
        const lastItemId = line.orderItemIds[line.orderItemIds.length - 1];
        if (!lastItemId) return;
        await voidOrderItem(orderId, lastItemId);
        setApiLines((prev) =>
          line.qty <= 1
            ? prev.filter((l) => l.menuItemId !== menuItemId)
            : prev.map((l) =>
                l.menuItemId === menuItemId
                  ? {
                      ...l,
                      orderItemIds: l.orderItemIds.slice(0, -1),
                      qty: l.qty - 1,
                    }
                  : l
              )
        );
      } catch (err) {
        console.error("decrementItem failed:", err);
      } finally {
        setIsMutating(false);
      }
    },
    [apiLines, orderId]
  );

  const removeItem = useCallback(
    async (menuItemId: string): Promise<void> => {
      const line = apiLines.find((l) => l.menuItemId === menuItemId);
      if (!line || !orderId) return;
      setIsMutating(true);
      try {
        await Promise.all(
          line.orderItemIds.map((iid) => voidOrderItem(orderId, iid))
        );
        setApiLines((prev) =>
          prev.filter((l) => l.menuItemId !== menuItemId)
        );
      } catch (err) {
        console.error("removeItem failed:", err);
      } finally {
        setIsMutating(false);
      }
    },
    [apiLines, orderId]
  );

  const clearCart = useCallback((): void => {
    setOrderId(null);
    setApiLines([]);
  }, []);

  /**
   * Fire the current order to the kitchen via POST /v1/orders/:id/send-to-kitchen.
   * Called before payment so the kitchen sees the order even if the customer abandons.
   * Non-fatal — logs error but does not block the payment flow.
   */
  const sendToKitchen = useCallback(async (): Promise<void> => {
    if (!orderId) return;
    try {
      await sendToKitchenApi(orderId);
    } catch (err) {
      // Non-fatal: kitchen won't see this order but payment can still proceed
      console.error("sendToKitchen failed (non-fatal):", err);
    }
  }, [orderId]);

  const pay = useCallback(
    async (method: string, tipCents: number): Promise<PaymentApiResponse> => {
      if (!orderId) throw new Error("No active order");
      const result = await createPayment(orderId, method, tipCents);
      setOrderId(null);
      setApiLines([]);
      return result;
    },
    [orderId]
  );

  return {
    lines,
    totals,
    itemCount,
    orderId,
    isMutating,
    addItem,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    sendToKitchen,
    pay,
  };
}
