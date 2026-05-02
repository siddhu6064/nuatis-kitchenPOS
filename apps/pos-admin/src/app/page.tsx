import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  LayoutDashboard,
  ShoppingCart,
  Banknote,
  UtensilsCrossed,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import type { Order } from "@nuatis/pos-shared";
import { listLocations } from "@/lib/api/orders";

const POS_API_URL = process.env["POS_API_URL"] ?? "http://localhost:3002";

interface EodReport {
  gross_sales_cents: number;
  net_sales_cents: number;
  tax_cents: number;
  tip_cents: number;
}

interface CashSession {
  id: string;
  opening_float_cents: number;
  status: string;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? "there";
  const posJwt = session?.user?.posJwt ?? "";

  let locationId: string | undefined;

  // Fetch locations first to get locationId
  try {
    const locs = await listLocations(posJwt);
    locationId = locs[0]?.id;
  } catch {
    // ok
  }

  // Parallel fetches — all gracefully fallback
  const [ordersResult, sessionResult, reportResult] = await Promise.allSettled(
    [
      apiGet<Order[]>(
        `/v1/orders?limit=200${locationId ? `&location_id=${locationId}` : ""}`,
        session
      ),
      locationId
        ? fetch(
            `${POS_API_URL}/v1/cash/sessions/current?location_id=${locationId}`,
            {
              headers: {
                Authorization: `Bearer ${posJwt}`,
                "Content-Type": "application/json",
              },
              cache: "no-store",
            }
          )
            .then((r) => (r.ok ? (r.json() as Promise<CashSession>) : null))
            .catch(() => null)
        : Promise.resolve(null),
      apiGet<EodReport>(
        `/v1/reports/end-of-day?date=${todayStr()}${locationId ? `&location_id=${locationId}` : ""}`,
        session
      ).catch(() => null),
    ]
  );

  const orders =
    ordersResult.status === "fulfilled" ? ordersResult.value : null;
  const cashSession =
    sessionResult.status === "fulfilled" ? sessionResult.value : null;
  const report =
    reportResult.status === "fulfilled" ? reportResult.value : null;

  const openOrders = orders?.filter(
    (o) => o.status === "open" || o.status === "fired"
  );
  const kitchenTickets = orders?.filter((o) => o.status === "fired");

  const summaryCards = [
    {
      label: "Today's Sales",
      value: report ? fmt(report.gross_sales_cents) : null,
      sub: report ? "Gross revenue today" : "No report data",
      icon: LayoutDashboard,
      href: "/reports",
    },
    {
      label: "Open Orders",
      value: openOrders != null ? String(openOrders.length) : null,
      sub: "Active + fired",
      icon: ShoppingCart,
      href: "/orders",
    },
    {
      label: "Cash Drawer",
      value: cashSession
        ? fmt(cashSession.opening_float_cents)
        : orders != null
          ? "No active shift"
          : null,
      sub: cashSession ? "Opening float" : "Start shift at terminal",
      icon: Banknote,
      href: "/cash",
    },
    {
      label: "KDS Tickets",
      value: kitchenTickets != null ? String(kitchenTickets.length) : null,
      sub: "Fired, waiting in kitchen",
      icon: UtensilsCrossed,
      href: "/orders",
    },
  ];

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900">
            Welcome back, {name}
          </h1>
          <p className="mt-1 text-slate-500 text-sm">
            Here&apos;s an overview of your business today.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summaryCards.map(({ label, value, sub, icon: Icon, href }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {label}
                </span>
                <Icon className="h-4 w-4 text-slate-300" />
              </div>
              {value === null ? (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="font-tabular text-lg font-semibold text-slate-400">
                    —
                  </span>
                </div>
              ) : (
                <p className="font-tabular text-2xl font-semibold text-slate-800">
                  {value}
                </p>
              )}
              <p className="text-xs text-slate-400">{sub}</p>
              <Link
                href={href}
                className="mt-auto text-xs text-brand font-medium hover:underline"
              >
                View →
              </Link>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-serif text-lg font-semibold text-slate-800 mb-3">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/menu"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              <UtensilsCrossed className="h-4 w-4" />
              Manage Menu
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              View Orders
            </Link>
            <Link
              href="/cash"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Banknote className="h-4 w-4" />
              Cash Drawer
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
