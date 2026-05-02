import { useState, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { MenuGrid } from "@/components/MenuGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { CheckoutOverlay, type TipOption } from "@/components/checkout/CheckoutOverlay";
import { TipKeypad } from "@/components/checkout/TipKeypad";
import { TapToPayScreen } from "@/components/checkout/TapToPayScreen";
import { ApprovedScreen } from "@/components/checkout/ApprovedScreen";
import { ReceiptScreen } from "@/components/checkout/ReceiptScreen";
import { useCart } from "@/hooks/useCart";
import { calcTipFromPct, calcGrandTotal } from "@/lib/tipMath";
import { saveLastOrder, loadLastOrder, clearLastOrder, type LastOrder } from "@/lib/lastOrder";

type CheckoutStep = "cart" | "tip-select" | "tap-to-pay" | "approved" | "receipt";

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
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);

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
    setLastOrder(loadLastOrder());
    setStep("approved");
  }, [lines, totals.subtotal, totals.tax, tipAmount, grandTotal]);

  const handleViewReceipt = () => {
    const order = lastOrder ?? loadLastOrder();
    setLastOrder(order);
    setStep("receipt");
  };

  const handleBackToApproved = () => setStep("approved");

  const handleNewOrder = () => {
    clearCart();
    clearLastOrder();
    setSelectedTip("18");
    setCustomTipAmount(0);
    setKeypadValue("");
    setLastOrder(null);
    setStep("cart");
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
      {/* Main POS shell */}
      <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
        {/* Header — 56px, slim */}
        <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-brand flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 .994.89l.006.11v3a3 3 0 0 1-3 3H6A3 3 0 0 1 3 7V4Zm0 7a5.002 5.002 0 0 0 4.472 4.972L8 16H7a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-1l.528-.028A5.002 5.002 0 0 0 17 11H3Z" />
              </svg>
            </span>
            <span className="font-serif font-semibold text-slate-900 tracking-tight leading-none">
              Nuatis POS
            </span>
            <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wider leading-none">
              · Cafe
            </span>
            {itemCount > 0 && (
              <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand text-white">
                {itemCount}
              </span>
            )}
          </div>

          {/* Right side: user info + DEMO badge + logout */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 font-medium">{displayName}</span>
            <span
              className="
                font-mono text-[10px] font-medium tracking-widest uppercase
                px-2 py-1 rounded border border-brand text-brand
                select-none
              "
            >
              DEMO
            </span>
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

      {/* Receipt */}
      {step === "receipt" && (
        <ReceiptScreen
          order={lastOrder ?? loadLastOrder()}
          onBackToApproved={handleBackToApproved}
          onNewOrder={handleNewOrder}
        />
      )}
    </>
  );
}
