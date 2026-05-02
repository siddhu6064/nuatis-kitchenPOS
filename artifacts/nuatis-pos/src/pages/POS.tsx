import { useState, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { MenuGrid } from "@/components/MenuGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { CheckoutOverlay, type TipOption } from "@/components/checkout/CheckoutOverlay";
import { TipKeypad } from "@/components/checkout/TipKeypad";
import { TapToPayScreen } from "@/components/checkout/TapToPayScreen";
import { ApprovedScreen } from "@/components/checkout/ApprovedScreen";
import { useCart } from "@/hooks/useCart";
import { calcTipFromPct, calcGrandTotal } from "@/lib/tipMath";
import { saveLastOrder } from "@/lib/lastOrder";

type CheckoutStep = "cart" | "tip-select" | "tap-to-pay" | "approved";

const TIP_PCT: Record<Exclude<TipOption, "custom" | "none">, number> = {
  "15": 0.15,
  "18": 0.18,
  "20": 0.20,
};

export function POS() {
  const { user, logout } = useAuth();
  const { lines, addItem, incrementItem, decrementItem, removeItem, clearCart, totals, itemCount } = useCart();

  const [step, setStep] = useState<CheckoutStep>("cart");
  const [selectedTip, setSelectedTip] = useState<TipOption>("18");
  const [customTipAmount, setCustomTipAmount] = useState(0);
  const [keypadValue, setKeypadValue] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);

  // Derived tip + totals
  const tipAmount =
    selectedTip === "none" ? 0
    : selectedTip === "custom" ? customTipAmount
    : calcTipFromPct(totals.subtotal, TIP_PCT[selectedTip]);

  const grandTotal = calcGrandTotal(totals.subtotal, totals.tax, tipAmount);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Staff";

  // Handlers
  const handleCharge = () => setStep("tip-select");
  const handleBackToCart = () => setStep("cart");
  const handleGoToPay = () => setStep("tap-to-pay");
  const handleCancelPay = () => setStep("tip-select");

  const handleApproved = useCallback(() => {
    saveLastOrder(lines, totals.subtotal, totals.tax, tipAmount, grandTotal);
    setStep("approved");
  }, [lines, totals.subtotal, totals.tax, tipAmount, grandTotal]);

  const handleNewOrder = () => {
    clearCart();
    setSelectedTip("18");
    setCustomTipAmount(0);
    setKeypadValue("");
    setStep("cart");
  };

  const handleViewReceipt = () => {
    console.log("receipt view requested");
  };

  const handleOpenKeypad = () => {
    setKeypadValue(customTipAmount > 0 ? customTipAmount.toFixed(2) : "");
    setShowKeypad(true);
  };

  const handleKeypadConfirm = () => {
    const val = parseFloat(keypadValue);
    if (!isNaN(val) && val > 0) {
      setCustomTipAmount(val);
      setSelectedTip("custom");
    }
    setShowKeypad(false);
  };

  const handleKeypadCancel = () => {
    setShowKeypad(false);
  };

  return (
    <>
      {/* Main POS shell — always rendered underneath overlays */}
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
            {itemCount > 0 && (
              <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
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
          <CartSidebar
            lines={lines}
            totals={totals}
            onIncrement={incrementItem}
            onDecrement={decrementItem}
            onRemove={removeItem}
            onClear={clearCart}
            onCharge={handleCharge}
          />
        </div>
      </div>

      {/* Checkout overlay — tip selection */}
      {step === "tip-select" && (
        <CheckoutOverlay
          lines={lines}
          totals={totals}
          selectedTip={selectedTip}
          customTipAmount={customTipAmount}
          onSelectTip={setSelectedTip}
          onOpenKeypad={handleOpenKeypad}
          onBack={handleBackToCart}
          onCharge={handleGoToPay}
        />
      )}

      {/* Custom tip keypad */}
      {showKeypad && (
        <TipKeypad
          value={keypadValue}
          onChange={setKeypadValue}
          onConfirm={handleKeypadConfirm}
          onCancel={handleKeypadCancel}
        />
      )}

      {/* Tap to pay */}
      {step === "tap-to-pay" && (
        <TapToPayScreen
          grandTotal={grandTotal}
          onApproved={handleApproved}
          onCancel={handleCancelPay}
        />
      )}

      {/* Approved */}
      {step === "approved" && (
        <ApprovedScreen
          subtotal={totals.subtotal}
          tax={totals.tax}
          tip={tipAmount}
          grandTotal={grandTotal}
          onNewOrder={handleNewOrder}
          onViewReceipt={handleViewReceipt}
        />
      )}
    </>
  );
}
