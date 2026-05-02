import { Plus, Minus, X } from "lucide-react";
import type { CartLine, CartTotals } from "@/hooks/useCart";
import { fmt } from "@/lib/tipMath";

interface Props {
  lines: CartLine[];
  totals: CartTotals;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCharge: () => void;
}

export function CartSidebar({ lines, totals, onIncrement, onDecrement, onRemove, onClear, onCharge }: Props) {
  const isEmpty = lines.length === 0;

  return (
    <aside className="w-[360px] shrink-0 flex flex-col bg-white border-l border-slate-200 h-full">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-800 tracking-tight">Current Order</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
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
          <ul className="divide-y divide-slate-100">
            {lines.map(({ item, qty }) => (
              <li
                key={item.id}
                className="relative flex items-center gap-3 py-3 last:border-0"
              >
                <button
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.name} from order`}
                  className="
                    absolute -top-0.5 right-0
                    w-[44px] h-[44px] flex items-center justify-center
                    text-slate-300 hover:text-red-400 active:text-red-600
                    transition-colors duration-100 rounded-lg
                  "
                >
                  <X size={15} strokeWidth={2.5} />
                </button>

                <div className="flex-1 min-w-0 pr-8">
                  <p className="text-slate-800 text-sm font-medium leading-tight truncate">{item.name}</p>
                  <p className="text-slate-400 text-xs mt-0.5 tabular-nums">${fmt(item.price)} each</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onDecrement(item.id)}
                    aria-label={qty === 1 ? `Remove ${item.name}` : `Decrease quantity of ${item.name}`}
                    className="
                      w-[44px] h-[44px] flex items-center justify-center
                      rounded-lg border border-slate-200 text-slate-600
                      hover:bg-slate-50 active:bg-slate-100
                      transition-colors duration-100
                    "
                  >
                    <Minus size={14} strokeWidth={2.5} />
                  </button>

                  <span className="w-6 text-center text-sm font-bold text-slate-800 tabular-nums select-none">
                    {qty}
                  </span>

                  <button
                    onClick={() => onIncrement(item.id)}
                    aria-label={`Increase quantity of ${item.name}`}
                    className="
                      w-[44px] h-[44px] flex items-center justify-center
                      rounded-lg bg-blue-50 border border-blue-200 text-brand
                      hover:bg-blue-100 active:bg-blue-200
                      transition-colors duration-100
                    "
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>

                  <span className="w-14 text-right text-sm font-bold text-slate-800 tabular-nums">
                    ${fmt(item.price * qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 pt-5 pb-4 border-t border-slate-100 space-y-2">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="tabular-nums">${fmt(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-500">
          <span>Tax (8.25%)</span>
          <span className="tabular-nums">${fmt(totals.tax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-slate-900 pt-3 border-t border-slate-200">
          <span>Total</span>
          <span className="tabular-nums">${fmt(totals.grandTotal)}</span>
        </div>

        <button
          onClick={onCharge}
          disabled={isEmpty}
          className="
            w-full mt-2 py-3.5 rounded-xl text-sm font-semibold
            bg-brand text-white
            hover:bg-blue-700 active:bg-blue-800
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-100
          "
        >
          {isEmpty ? "Charge" : `Charge $${fmt(totals.grandTotal)}`}
        </button>

        <button
          onClick={onClear}
          disabled={isEmpty}
          className="
            w-full py-2.5 rounded-lg text-sm font-medium
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
