/**
 * Unit tests for the end-of-day report aggregation library.
 *
 * All tests run without any external dependencies (no DB, no Redis).
 */

import { describe, it, expect } from "vitest";
import {
  aggregateEndOfDay,
  toTenantDateStr,
  type AggregateParams,
  type OrderRow,
  type OrderItemRow,
  type PaymentRow,
  type RefundRow,
  type StaffMemberRow,
  type MenuItemRow,
} from "./reports.js";

// ---------------------------------------------------------------------------
// Helpers to build minimal fixture objects
// ---------------------------------------------------------------------------

const TZ = "UTC";
const DATE = "2026-05-02";

function makeOrder(
  overrides: Partial<OrderRow> & { id: string }
): OrderRow {
  return {
    status: "paid",
    subtotal_cents: 0,
    tax_cents: 0,
    tip_cents: 0,
    opened_by_staff_id: null,
    created_at: `${DATE}T10:00:00Z`,
    voided_at: null,
    closed_at: `${DATE}T10:01:00Z`,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<OrderItemRow> & { id: string; order_id: string }
): OrderItemRow {
  return {
    menu_item_id: null,
    name_snapshot: "Latte",
    qty: 1,
    price_cents: 400,
    status: "active",
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<PaymentRow> & { id: string; order_id: string }
): PaymentRow {
  return {
    method: "cash",
    amount_cents: 400,
    tip_cents: 0,
    status: "succeeded",
    created_at: `${DATE}T10:01:00Z`,
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<AggregateParams> = {}
): AggregateParams {
  return {
    date: DATE,
    timezone: TZ,
    orders: [],
    orderItems: [],
    payments: [],
    refunds: [],
    cashEvents: [],
    staffMembers: [],
    menuItems: [],
    salesTaxBps: 825,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("toTenantDateStr", () => {
  it("converts a UTC timestamp to the correct date in the given timezone", () => {
    // 2026-01-03T04:55:00Z = 23:55 on Jan 2 in America/New_York (EST = UTC-5)
    expect(toTenantDateStr("2026-01-03T04:55:00Z", "America/New_York")).toBe(
      "2026-01-02"
    );
    // 2026-01-03T05:05:00Z = 00:05 on Jan 3 in America/New_York
    expect(toTenantDateStr("2026-01-03T05:05:00Z", "America/New_York")).toBe(
      "2026-01-03"
    );
  });
});

describe("aggregateEndOfDay — empty day", () => {
  it("returns all-zero totals when there are no orders", () => {
    const result = aggregateEndOfDay(baseParams());
    expect(result.gross_sales_cents).toBe(0);
    expect(result.tips_cents).toBe(0);
    expect(result.tax_cents).toBe(0);
    expect(result.taxable_cents).toBe(0);
    expect(result.voids_cents).toBe(0);
    expect(result.refunds_cents).toBe(0);
    expect(result.net_cents).toBe(0);
    expect(result.order_count).toBe(0);
    expect(result.paid_order_count).toBe(0);
    expect(result.voided_order_count).toBe(0);
    expect(result.by_method).toHaveLength(0);
    expect(result.by_item).toHaveLength(0);
    expect(result.by_staff).toHaveLength(0);
  });
});

describe("aggregateEndOfDay — single cash sale, no tip", () => {
  it("computes gross_sales, by_method, order_count correctly", () => {
    const order = makeOrder({ id: "ord-1", subtotal_cents: 400 });
    const payment = makePayment({ id: "pay-1", order_id: "ord-1" });
    const item = makeItem({ id: "itm-1", order_id: "ord-1" });

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], orderItems: [item], payments: [payment] })
    );

    expect(result.gross_sales_cents).toBe(400);
    expect(result.tips_cents).toBe(0);
    expect(result.net_cents).toBe(400);
    expect(result.order_count).toBe(1);
    expect(result.paid_order_count).toBe(1);
    expect(result.by_method).toEqual([
      { method: "cash", count: 1, gross_cents: 400 },
    ]);
  });
});

describe("aggregateEndOfDay — multiple sales, different methods", () => {
  it("aggregates by_method correctly across card and cash", () => {
    const orders = [
      makeOrder({ id: "ord-1", subtotal_cents: 500 }),
      makeOrder({ id: "ord-2", subtotal_cents: 800 }),
      makeOrder({ id: "ord-3", subtotal_cents: 300 }),
    ];
    const payments = [
      makePayment({ id: "p1", order_id: "ord-1", method: "cash", amount_cents: 500 }),
      makePayment({ id: "p2", order_id: "ord-2", method: "card_present", amount_cents: 800 }),
      makePayment({ id: "p3", order_id: "ord-3", method: "card_present", amount_cents: 300 }),
    ];

    const result = aggregateEndOfDay(
      baseParams({ orders, orderItems: [], payments })
    );

    expect(result.gross_sales_cents).toBe(1600);
    const cashEntry = result.by_method.find((m) => m.method === "cash");
    const cardEntry = result.by_method.find((m) => m.method === "card_present");
    expect(cashEntry).toEqual({ method: "cash", count: 1, gross_cents: 500 });
    expect(cardEntry).toEqual({ method: "card_present", count: 2, gross_cents: 1100 });
  });
});

describe("aggregateEndOfDay — voided order excluded from gross", () => {
  it("voided order does not contribute to gross_sales or paid counts", () => {
    const paidOrder = makeOrder({ id: "ord-1", subtotal_cents: 400 });
    const voidedOrder = makeOrder({
      id: "ord-2",
      status: "voided",
      subtotal_cents: 600,
      tax_cents: 50,
      voided_at: `${DATE}T11:00:00Z`,
    });
    const payment = makePayment({ id: "p1", order_id: "ord-1", amount_cents: 400 });

    const result = aggregateEndOfDay(
      baseParams({ orders: [paidOrder, voidedOrder], payments: [payment] })
    );

    expect(result.gross_sales_cents).toBe(400);
    expect(result.paid_order_count).toBe(1);
  });
});

describe("aggregateEndOfDay — voided order counted in voids_cents", () => {
  it("sums subtotal + tax of voided orders into voids_cents", () => {
    const voidedOrder = makeOrder({
      id: "ord-1",
      status: "voided",
      subtotal_cents: 600,
      tax_cents: 50,
      voided_at: `${DATE}T11:00:00Z`,
    });

    const result = aggregateEndOfDay(
      baseParams({ orders: [voidedOrder] })
    );

    expect(result.voids_cents).toBe(650); // 600 + 50
    expect(result.voided_order_count).toBe(1);
  });
});

describe("aggregateEndOfDay — refund on the same day reduces net", () => {
  it("deducts refund from net but not from gross", () => {
    const order = makeOrder({ id: "ord-1", subtotal_cents: 1000 });
    const payment = makePayment({ id: "p1", order_id: "ord-1", amount_cents: 1000 });
    const refund: RefundRow = {
      id: "ref-1",
      order_id: "ord-1",
      amount_cents: 300,
      created_at: `${DATE}T15:00:00Z`,
    };

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], payments: [payment], refunds: [refund] })
    );

    expect(result.gross_sales_cents).toBe(1000);
    expect(result.refunds_cents).toBe(300);
    expect(result.net_cents).toBe(700); // 1000 + 0 tip - 300 refund
  });
});

describe("aggregateEndOfDay — tip calculation", () => {
  it("separates tip from gross and sums both in net", () => {
    const order = makeOrder({ id: "ord-1", subtotal_cents: 1000 });
    const payment = makePayment({
      id: "p1",
      order_id: "ord-1",
      amount_cents: 1200, // includes $2 tip
      tip_cents: 200,
    });

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], payments: [payment] })
    );

    expect(result.gross_sales_cents).toBe(1000); // amount - tip
    expect(result.tips_cents).toBe(200);
    expect(result.net_cents).toBe(1200); // gross + tips - refunds
  });
});

describe("aggregateEndOfDay — by_item percentages sum to ~100%", () => {
  it("pct_of_total values sum within 0.5% of 100", () => {
    const order = makeOrder({ id: "ord-1" });
    const menuItems: MenuItemRow[] = [
      { id: "mi-1", taxable: false },
      { id: "mi-2", taxable: false },
      { id: "mi-3", taxable: false },
    ];
    const items: OrderItemRow[] = [
      makeItem({ id: "i1", order_id: "ord-1", menu_item_id: "mi-1", name_snapshot: "Espresso", qty: 2, price_cents: 300 }),
      makeItem({ id: "i2", order_id: "ord-1", menu_item_id: "mi-2", name_snapshot: "Latte", qty: 1, price_cents: 500 }),
      makeItem({ id: "i3", order_id: "ord-1", menu_item_id: "mi-3", name_snapshot: "Scone", qty: 3, price_cents: 250 }),
    ];
    const payment = makePayment({
      id: "p1", order_id: "ord-1",
      amount_cents: 600 + 500 + 750,
    });

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], orderItems: items, payments: [payment], menuItems })
    );

    const total = result.by_item.reduce((s, i) => s + i.pct_of_total, 0);
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThanOrEqual(100.01);
  });
});

describe("aggregateEndOfDay — by_staff aggregation", () => {
  it("groups tickets and totals by staff member", () => {
    const staff: StaffMemberRow[] = [
      { id: "staff-1", full_name: "Alice" },
      { id: "staff-2", full_name: "Bob" },
    ];
    const orders = [
      makeOrder({ id: "ord-1", opened_by_staff_id: "staff-1" }),
      makeOrder({ id: "ord-2", opened_by_staff_id: "staff-1" }),
      makeOrder({ id: "ord-3", opened_by_staff_id: "staff-2" }),
    ];
    const payments = [
      makePayment({ id: "p1", order_id: "ord-1", amount_cents: 400 }),
      makePayment({ id: "p2", order_id: "ord-2", amount_cents: 600, tip_cents: 100 }),
      makePayment({ id: "p3", order_id: "ord-3", amount_cents: 800 }),
    ];

    const result = aggregateEndOfDay(
      baseParams({ orders, payments, staffMembers: staff })
    );

    const alice = result.by_staff.find((s) => s.staff_id === "staff-1");
    const bob = result.by_staff.find((s) => s.staff_id === "staff-2");

    expect(alice?.ticket_count).toBe(2);
    expect(alice?.gross_cents).toBe(400 + 500); // 400 + (600-100)
    expect(alice?.tips_cents).toBe(100);
    expect(bob?.ticket_count).toBe(1);
    expect(bob?.gross_cents).toBe(800);
  });
});

describe("aggregateEndOfDay — deleted menu item (null menu_item_id)", () => {
  it("handles items with null menu_item_id gracefully", () => {
    const order = makeOrder({ id: "ord-1" });
    const item = makeItem({
      id: "i1",
      order_id: "ord-1",
      menu_item_id: null, // deleted item
      name_snapshot: "Old Special",
      qty: 1,
      price_cents: 700,
    });
    const payment = makePayment({ id: "p1", order_id: "ord-1", amount_cents: 700 });

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], orderItems: [item], payments: [payment] })
    );

    expect(result.by_item).toHaveLength(1);
    expect(result.by_item[0]!.menu_item_id).toBeNull();
    expect(result.by_item[0]!.name).toBe("Old Special");
    expect(result.by_item[0]!.qty_sold).toBe(1);
    expect(result.taxable_cents).toBe(0); // deleted item assumed non-taxable
  });
});

describe("aggregateEndOfDay — timezone boundary", () => {
  it("order at 23:55 local time stays in the date; 00:05 next day does not", () => {
    // America/New_York in January = EST = UTC-5
    // 2026-01-03T04:55:00Z = 23:55 on Jan 2 EST  → in date 2026-01-02
    // 2026-01-03T05:05:00Z = 00:05 on Jan 3 EST  → NOT in date 2026-01-02
    const orderInDate = makeOrder({
      id: "ord-in",
      created_at: "2026-01-03T04:55:00Z",
      closed_at: "2026-01-03T04:55:00Z",
    });
    const orderNextDay = makeOrder({
      id: "ord-next",
      created_at: "2026-01-03T05:05:00Z",
      closed_at: "2026-01-03T05:05:00Z",
    });
    const payments = [
      makePayment({ id: "p1", order_id: "ord-in", amount_cents: 400, created_at: "2026-01-03T04:55:00Z" }),
      makePayment({ id: "p2", order_id: "ord-next", amount_cents: 600, created_at: "2026-01-03T05:05:00Z" }),
    ];

    const result = aggregateEndOfDay(
      baseParams({
        date: "2026-01-02",
        timezone: "America/New_York",
        orders: [orderInDate, orderNextDay],
        payments,
      })
    );

    expect(result.paid_order_count).toBe(1);
    expect(result.gross_sales_cents).toBe(400);
    expect(result.order_count).toBe(1);
  });
});

describe("aggregateEndOfDay — taxable items", () => {
  it("only counts items with taxable=true in taxable_cents", () => {
    const order = makeOrder({ id: "ord-1" });
    const menuItems: MenuItemRow[] = [
      { id: "mi-taxable", taxable: true },
      { id: "mi-nontaxable", taxable: false },
    ];
    const items: OrderItemRow[] = [
      makeItem({ id: "i1", order_id: "ord-1", menu_item_id: "mi-taxable", name_snapshot: "Food", qty: 2, price_cents: 500 }),
      makeItem({ id: "i2", order_id: "ord-1", menu_item_id: "mi-nontaxable", name_snapshot: "Coffee", qty: 1, price_cents: 400 }),
    ];
    const payment = makePayment({ id: "p1", order_id: "ord-1", amount_cents: 1400 });

    const result = aggregateEndOfDay(
      baseParams({ orders: [order], orderItems: items, payments: [payment], menuItems })
    );

    expect(result.taxable_cents).toBe(1000); // only 2 × $5 taxable items
  });
});

describe("aggregateEndOfDay — discounts_cents is always 0 in MVP", () => {
  it("returns 0 for discounts_cents regardless of input", () => {
    const result = aggregateEndOfDay(baseParams());
    expect(result.discounts_cents).toBe(0);
  });
});
