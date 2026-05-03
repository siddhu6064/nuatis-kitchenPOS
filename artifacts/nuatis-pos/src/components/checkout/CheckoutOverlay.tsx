import { ArrowLeft } from "lucide-react";
import { fmt, calcTipFromPct, calcGrandTotal } from "@/lib/tipMath";
import type { CartLine, CartTotals } from "@/hooks/useCart";

export type TipOption = "15" | "18" | "20" | "custom" | "none";
export type PaymentMethodOption = "card_mock" | "card_stripe";

interface Props {
  lines: CartLine[];
  totals: CartTotals;
  selectedTip: TipOption;
  customTipAmount: number;
  onSelectTip: (t: TipOption) => void;
  onOpenKeypad: () => void;
  onBack: () => void;
  onCharge: () => void;
  paymentMethod?: PaymentMethodOption;
  onPaymentMethodChange?: (m: PaymentMethodOption) => void;
  stripeReady?: boolean;
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
  paymentMethod = "card_mock",
  onPaymentMethodChange,
  stripeReady = false,
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

          {/* Payment method — only shown when handler provided (Stripe Terminal wired) */}
          {onPaymentMethodChange && (
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Method</h3>
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onPaymentMethodChange("card_mock")}
                    aria-pressed={paymentMethod === "card_mock"}
                    className={`
                      flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-100
                      ${paymentMethod === "card_mock"
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"}
                    `}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                    </svg>
                    Mock Card
                  </button>
                  <button
                    onClick={() => onPaymentMethodChange("card_stripe")}
                    aria-pressed={paymentMethod === "card_stripe"}
                    disabled={!stripeReady}
                    className={`
                      flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-100
                      ${paymentMethod === "card_stripe"
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"}
                      disabled:opacity-40 disabled:cursor-not-allowed
                    `}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Stripe Terminal
                    {!stripeReady && <span className="ml-auto text-[10px] text-slate-400 shrink-0">Not ready</span>}
                  </button>
                </div>
              </div>
            </section>
          )}
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
            {paymentMethod === "card_stripe"
              ? `Pay via Terminal $${fmt(grandTotal)}`
              : `Tap to Pay $${fmt(grandTotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
