import type { CartLine, CartTotals } from "@/hooks/useCart";

interface Props {
  lines: CartLine[];
  totals: CartTotals;
  onClear: () => void;
}

function fmt(n: number) {
  return n.toFixed(2);
}

export function CartSidebar({ lines, totals, onClear }: Props) {
  const isEmpty = lines.length === 0;

  return (
    <aside className="w-[360px] shrink-0 flex flex-col bg-white border-l border-slate-200 h-full">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800 tracking-tight">Current Order</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm font-medium">No items yet</p>
            <p className="text-slate-400 text-xs mt-1">Tap a menu item to start an order.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {lines.map(({ item, qty }) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">
                    {qty}
                  </span>
                  <span className="text-slate-800 text-sm font-medium truncate">{item.name}</span>
                </div>
                <span className="text-slate-700 text-sm font-semibold tabular-nums ml-4 shrink-0">
                  ${fmt(item.price * qty)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100 space-y-2">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="tabular-nums">${fmt(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-500">
          <span>Tax (8.25%)</span>
          <span className="tabular-nums">${fmt(totals.tax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span className="tabular-nums">${fmt(totals.grandTotal)}</span>
        </div>

        <button
          onClick={onClear}
          disabled={isEmpty}
          className="
            w-full mt-3 py-2.5 rounded-lg text-sm font-medium
            border border-slate-200 text-slate-600
            hover:bg-slate-50 active:bg-slate-100
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-100
          "
        >
          Clear cart
        </button>
      </div>
    </aside>
  );
}
