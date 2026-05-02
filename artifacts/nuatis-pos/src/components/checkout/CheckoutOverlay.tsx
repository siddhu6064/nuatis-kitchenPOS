import { ArrowLeft } from "lucide-react";
import { fmt, calcTipFromPct, calcGrandTotal } from "@/lib/tipMath";
import type { CartLine, CartTotals } from "@/hooks/useCart";

export type TipOption = "15" | "18" | "20" | "custom" | "none";

interface Props {
  lines: CartLine[];
  totals: CartTotals;
  selectedTip: TipOption;
  customTipAmount: number;
  onSelectTip: (t: TipOption) => void;
  onOpenKeypad: () => void;
  onBack: () => void;
  onCharge: () => void;
}

const TIP_PRESETS: Array<{ key: TipOption; pct: number; label: string }> = [
  { key: "15", pct: 0.15, label: "15%" },
  { key: "18", pct: 0.18, label: "18%" },
  { key: "20", pct: 0.20, label: "20%" },
  { key: "custom", pct: 0,  label: "Custom" },
];

function getTipAmount(selected: TipOption, subtotal: number, customTip: number): number {
  if (selected === "none") return 0;
  if (selected === "custom") return customTip;
  const preset = TIP_PRESETS.find((p) => p.key === selected);
  return preset ? calcTipFromPct(subtotal, preset.pct) : 0;
}

export function CheckoutOverlay({
  lines,
  totals,
  selectedTip,
  customTipAmount,
  onSelectTip,
  onOpenKeypad,
  onBack,
  onCharge,
}: Props) {
  const tipAmount = getTipAmount(selectedTip, totals.subtotal, customTipAmount);
  const grandTotal = calcGrandTotal(totals.subtotal, totals.tax, tipAmount);

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <button
          onClick={onBack}
          aria-label="Back to cart"
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-slate-800">Checkout</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-6 space-y-6">

          {/* Order summary */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order Summary</h3>
            </div>
            <ul className="divide-y divide-slate-50">
              {lines.map(({ item, qty }) => (
                <li key={item.id} className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-slate-700">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-slate-400 ml-2">×{qty}</span>
                  </span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    ${fmt(item.price * qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-slate-100 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">${fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>Tax (8.25%)</span>
                <span className="tabular-nums">${fmt(totals.tax)}</span>
              </div>
            </div>
          </section>

          {/* Tip selection */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add a Tip</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {TIP_PRESETS.map((preset) => {
                  const isSelected = selectedTip === preset.key;
                  const amount = preset.key !== "custom"
                    ? calcTipFromPct(totals.subtotal, preset.pct)
                    : customTipAmount;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => {
                        if (preset.key === "custom") {
                          onOpenKeypad();
                        } else {
                          onSelectTip(preset.key);
                        }
                      }}
                      aria-pressed={isSelected}
                      className={`
                        flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all duration-100
                        ${isSelected
                          ? "border-brand bg-brand text-white shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}
                      `}
                    >
                      <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-slate-800"}`}>
                        {preset.label}
                      </span>
                      {preset.key !== "custom" ? (
                        <span className={`text-xs mt-0.5 tabular-nums ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                          ${fmt(amount)}
                        </span>
                      ) : (
                        <span className={`text-xs mt-0.5 tabular-nums ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                          {customTipAmount > 0 ? `$${fmt(customTipAmount)}` : "Enter"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="text-center">
                <button
                  onClick={() => onSelectTip("none")}
                  className={`text-sm transition-colors ${selectedTip === "none" ? "text-slate-900 font-semibold" : "text-slate-400 hover:text-slate-600"}`}
                >
                  No tip
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom total + CTA */}
      <div className="bg-white border-t border-slate-200 px-6 py-5 shrink-0">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-xs text-slate-500">
                Subtotal ${fmt(totals.subtotal)} · Tax ${fmt(totals.tax)}
                {tipAmount > 0 && ` · Tip $${fmt(tipAmount)}`}
              </p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
                Total ${fmt(grandTotal)}
              </p>
            </div>
          </div>
          <button
            onClick={onCharge}
            className="
              w-full py-4 rounded-xl text-base font-semibold
              bg-brand text-white
              hover:bg-blue-700 active:bg-blue-800
              transition-colors duration-100
            "
          >
            Tap to Pay ${fmt(grandTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
