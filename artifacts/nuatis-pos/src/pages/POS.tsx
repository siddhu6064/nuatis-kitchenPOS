import { useAuth } from "@workspace/replit-auth-web";
import { MenuGrid } from "@/components/MenuGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { useCart } from "@/hooks/useCart";

export function POS() {
  const { user, logout } = useAuth();
  const { lines, addItem, clearCart, totals } = useCart();

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Staff";

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 .994.89l.006.11v3a3 3 0 0 1-3 3H6A3 3 0 0 1 3 7V4Zm0 7a5.002 5.002 0 0 0 4.472 4.972L8 16H7a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-1l.528-.028A5.002 5.002 0 0 0 17 11H3Z" />
            </svg>
          </span>
          <span className="font-semibold text-slate-900 tracking-tight">Nuatis POS</span>
          <span className="text-slate-400 text-sm">·</span>
          <span className="text-slate-500 text-sm">Cafe</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 font-medium">{displayName}</span>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors duration-100"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <MenuGrid onTap={addItem} />
        <CartSidebar lines={lines} totals={totals} onClear={clearCart} />
      </div>
    </div>
  );
}
