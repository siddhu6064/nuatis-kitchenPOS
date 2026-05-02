import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { LayoutDashboard, ShoppingCart, Banknote, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

const summaryCards = [
  {
    label: "Today's Sales",
    value: "—",
    sub: "Revenue",
    icon: LayoutDashboard,
    href: "/reports",
  },
  {
    label: "Open Orders",
    value: "—",
    sub: "Active",
    icon: ShoppingCart,
    href: "/orders",
  },
  {
    label: "Cash Drawer",
    value: "—",
    sub: "Balance",
    icon: Banknote,
    href: "/cash",
  },
  {
    label: "KDS Tickets",
    value: "—",
    sub: "Sent to kitchen",
    icon: UtensilsCrossed,
    href: "/orders",
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? "there";

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

        {/* Banner */}
        <div className="rounded-xl border border-brand/20 bg-brand/5 px-5 py-4">
          <p className="text-sm text-brand font-medium">
            Menu management is live — other sections are coming online in subsequent batches.
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
              <p className="font-tabular text-2xl font-semibold text-slate-800">
                {value}
              </p>
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
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
