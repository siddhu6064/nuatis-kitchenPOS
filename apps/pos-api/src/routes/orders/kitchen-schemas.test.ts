import { describe, it, expect } from "vitest";
import { KitchenBroadcastEventSchema, KitchenBumpEventSchema } from "@nuatis/pos-shared";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const VALID_ISO = "2026-05-02T12:00:00.000Z";

describe("KitchenBroadcastEventSchema — unit", () => {
  const validPayload = {
    event: "order_fired",
    order_id: VALID_UUID,
    location_id: VALID_UUID,
    order_number: 42,
    opened_at: VALID_ISO,
    items: [
      {
        id: VALID_UUID,
        name: "Espresso",
        quantity: 2,
        modifiers: [{ group_name: "Milk", option_name: "Oat" }],
      },
    ],
  };

  it("parses a valid order_fired payload", () => {
    const result = KitchenBroadcastEventSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe("order_fired");
      expect(result.data.order_number).toBe(42);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]?.modifiers[0]?.option_name).toBe("Oat");
    }
  });

  it("rejects missing required field (order_number)", () => {
    const { order_number: _omit, ...withoutNum } = validPayload;
    const result = KitchenBroadcastEventSchema.safeParse(withoutNum);
    expect(result.success).toBe(false);
  });

  it("rejects wrong event literal", () => {
    const result = KitchenBroadcastEventSchema.safeParse({
      ...validPayload,
      event: "order_paid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID format for order_id", () => {
    const result = KitchenBroadcastEventSchema.safeParse({
      ...validPayload,
      order_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive item quantity", () => {
    const result = KitchenBroadcastEventSchema.safeParse({
      ...validPayload,
      items: [{ ...validPayload.items[0]!, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("KitchenBumpEventSchema — unit", () => {
  const validBump = {
    event: "item_bumped",
    order_id: VALID_UUID,
    item_id: VALID_UUID,
  };

  it("parses a valid item_bumped payload", () => {
    const result = KitchenBumpEventSchema.safeParse(validBump);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.event).toBe("item_bumped");
    }
  });

  it("rejects missing item_id", () => {
    const { item_id: _omit, ...withoutItem } = validBump;
    const result = KitchenBumpEventSchema.safeParse(withoutItem);
    expect(result.success).toBe(false);
  });

  it("rejects wrong event literal", () => {
    const result = KitchenBumpEventSchema.safeParse({
      ...validBump,
      event: "order_fired",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for item_id", () => {
    const result = KitchenBumpEventSchema.safeParse({
      ...validBump,
      item_id: "bad-id",
    });
    expect(result.success).toBe(false);
  });
});
