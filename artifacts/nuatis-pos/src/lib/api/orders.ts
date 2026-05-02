import { post, del } from "./client";
import type { OrderItemResponse, PaymentApiResponse } from "./types";

export function createOrder(
  location_id: string,
  staff_id?: string
): Promise<{ id: string; status: string }> {
  return post("/v1/orders", { location_id, staff_id });
}

export function addOrderItem(
  order_id: string,
  menu_item_id: string,
  quantity = 1,
  modifiers: Array<{ group_id: string; option_id: string }> = []
): Promise<OrderItemResponse> {
  return post(`/v1/orders/${order_id}/items`, {
    menu_item_id,
    quantity,
    modifiers,
  });
}

export function voidOrderItem(
  order_id: string,
  item_id: string
): Promise<void> {
  return del(`/v1/orders/${order_id}/items/${item_id}`);
}

export function sendToKitchen(
  order_id: string
): Promise<{ id: string; status: string }> {
  return post(`/v1/orders/${order_id}/send-to-kitchen`, {});
}

export function bumpOrderItem(
  order_id: string,
  item_id: string
): Promise<OrderItemResponse> {
  return post(`/v1/orders/${order_id}/items/${item_id}/bump`, {});
}

export function createPayment(
  order_id: string,
  method: string,
  tip_cents: number
): Promise<PaymentApiResponse> {
  return post(`/v1/orders/${order_id}/payments`, { method, tip_cents });
}
