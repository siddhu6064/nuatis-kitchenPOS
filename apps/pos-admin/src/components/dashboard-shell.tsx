import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingCart,
  Banknote,
  BarChart3,
  Users,
  Receipt,
  Settings,
} from "lucide-react";
import { LocationSwitcher } from "@/components/location-switcher";
import { listLocations } from "@/lib/api/orders";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/cash", label: "Cash Drawer", icon: Banknote },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

export async function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const tenantName = session?.user?.name ?? "Your Business";
  const tenantRole = session?.user?.role ?? "owner";
  const posJwt = session?.user?.posJwt ?? "";

  let locations: { id: string; name: string }[] = [];
  try {
    locations = await listLocations(posJwt);
  } catch {
    // ok — location switcher shows fallback
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-white border-r border-slate-200">
        {/* Wordmark */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <span className="font-serif text-xl font-bold text-slate-900 tracking-tight">
            Nuatis POS
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-600 truncate max-w-[130px]">
              {tenantName}
            </span>
            <span className="shrink-0 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand capitalize">
              {tenantRole}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors group"
            >
              <Icon className="h-4 w-4 text-slate-400 group-hover:text-brand transition-colors" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-slate-100">
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6">
          <LocationSwitcher locations={locations} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {session?.user?.email ?? ""}
            </span>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
