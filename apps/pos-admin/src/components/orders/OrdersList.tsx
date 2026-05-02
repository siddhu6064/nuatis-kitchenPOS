"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Order } from "@nuatis/pos-shared";
import { RefreshCw, ShoppingCart } from "lucide-react";
import { listOrders } from "@/lib/api/orders";
import { OrderDrawer } from "./OrderDrawer";

type Tab = "active" | "today" | "history";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  fired: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function filterOrders(orders: Order[], tab: Tab): Order[] {
  switch (tab) {
    case "active":
      return orders.filter(
        (o) => o.status === "open" || o.status === "fired"
      );
    case "today":
      return orders.filter(
        (o) =>
          (o.status === "paid" || o.status === "voided") &&
          isToday(o.opened_at)
      );
    case "history":
      return orders.filter(
        (o) =>
          (o.status === "paid" || o.status === "voided") &&
          !isToday(o.opened_at)
      );
  }
}

const EMPTY_COPY: Record<Tab, { title: string; sub: string }> = {
  active: {
    title: "No active orders",
    sub: "Open orders and fired kitchen tickets will appear here.",
  },
  today: {
    title: "No completed orders today",
    sub: "Paid and voided orders from today will appear here.",
  },
  history: {
    title: "No past orders",
    sub: "Completed orders from previous days will appear here.",
  },
};

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "today", label: "Today" },
  { key: "history", label: "History" },
];

interface Props {
  initialOrders: Order[];
  posJwt: string;
  locationId?: string;
}

export function OrdersList({ initialOrders, posJwt, locationId }: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { data: orders, refetch, isFetching } = useQuery<Order[]>({
    queryKey: ["orders", locationId],
    queryFn: () => listOrders(posJwt, { location_id: locationId, limit: 100 }),
    initialData: initialOrders,
    refetchInterval: tab === "active" ? 10_000 : false,
    staleTime: 5_000,
  });

  const filtered = filterOrders(orders ?? [], tab);
  const empty = EMPTY_COPY[tab];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map(({ key, label }) => {
            const count =
              key === "active"
                ? filterOrders(orders ?? [], "active").length
                : undefined;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-brand text-white text-[10px] font-semibold w-4 h-4">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {tab === "active" ? "Auto-refreshing" : "Refresh"}
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <ShoppingCart className="h-10 w-10 text-slate-300" />
          <p className="font-serif text-lg font-semibold text-slate-600">
            {empty.title}
          </p>
          <p className="text-sm text-slate-400 max-w-xs">{empty.sub}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    #{order.order_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {relativeTime(order.opened_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">—</td>
                  <td className="px-4 py-3 text-right font-tabular text-slate-800">
                    {fmt(order.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order detail drawer */}
      <OrderDrawer
        orderId={selectedOrderId}
        posJwt={posJwt}
        onClose={() => setSelectedOrderId(null)}
        onVoided={() => {
          setSelectedOrderId(null);
          void refetch();
        }}
      />
    </div>
  );
}
