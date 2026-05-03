import { useState, useCallback } from "react";
import { useAuth } from "@/lib/api/AuthContext";
import { MenuGrid } from "@/components/MenuGrid";
import { CartSidebar } from "@/components/CartSidebar";
import { CheckoutOverlay, type TipOption, type PaymentMethodOption } from "@/components/checkout/CheckoutOverlay";
import { TipKeypad } from "@/components/checkout/TipKeypad";
import { TapToPayScreen } from "@/components/checkout/TapToPayScreen";
import { ApprovedScreen } from "@/components/checkout/ApprovedScreen";
import { ReceiptScreen } from "@/components/checkout/ReceiptScreen";
import { ReceiptPromptScreen } from "@/components/checkout/ReceiptPromptScreen";
import { useOrder } from "@/hooks/useOrder";
import { useStripeTerminal } from "@/components/StripeTerminalProvider";
import { calcTipFromPct, calcGrandTotal } from "@/lib/tipMath";
import { saveLastOrder, loadLastOrder, clearLastOrder, type LastOrder } from "@/lib/lastOrder";
import { createPayment } from "@/lib/api/orders";
import type { ApiMenuItem } from "@/lib/api/types";

type CheckoutStep = "cart" | "tip-select" | "tap-to-pay" | "approved" | "send-receipt" | "receipt";

const TIP_PCT: Record<Exclude<TipOption, "custom" | "none">, number> = {
  "15": 0.15,
  "18": 0.18,
  "20": 0.20,
};

export function POS() {
  const { displayName, signOut } = useAuth();
  const {
    lines,
    addItem,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    totals,
    itemCount,
    orderId,
    sendToKitchen,
    pay,
  } = useOrder();

  const { terminal, isReady: terminalReady } = useStripeTerminal();

  const [step, setStep] = useState<CheckoutStep>("cart");
  const [selectedTip, setSelectedTip] = useState<TipOption>("18");
  const [customTipAmount, setCustomTipAmount] = useState(0);
  const [keypadValue, setKeypadValue] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [paidOrderId, setPaidOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodOption>("card_mock");
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeSubtitle, setStripeSubtitle] = useState("Waiting for card…");

  // Derived tip + totals
  const tipAmount =
    selectedTip === "none" ? 0
    : selectedTip === "custom" ? customTipAmount
    : calcTipFromPct(totals.subtotal, TIP_PCT[selectedTip]);

  const grandTotal = calcGrandTotal(totals.subtotal, totals.tax, tipAmount);

  // ---------------------------------------------------------------------------
  // Shared "mark approved" — called from both card_mock and card_stripe paths
  // ---------------------------------------------------------------------------
  function markApproved(currentOrderId: string | null) {
    setPaidOrderId(currentOrderId);
    saveLastOrder(lines, totals.subtotal, totals.tax, tipAmount, grandTotal);
    setLastOrder(loadLastOrder());
    setStep("approved");
  }

  // Handlers
  const handleCharge = () => {
    setStripeError(null);
    setStep("tip-select");
  };
  const handleBackToCart = () => setStep("cart");

  // ---------------------------------------------------------------------------
  // card_mock path — existing 2.5s timer in TapToPayScreen handles approval
  // ---------------------------------------------------------------------------
  const handleGoToPayMock = () => {
    void sendToKitchen();
    setStep("tap-to-pay");
  };

  const handleCancelPay = () => {
    // If Stripe terminal is mid-collection, cancel it
    if (terminal && paymentMethod === "card_stripe") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      void (terminal as { cancelCollectPaymentMethod: () => Promise<void> })
        .cancelCollectPaymentMethod()
        .catch(() => undefined);
    }
    setStep("tip-select");
  };

  const handleApproved = useCallback(() => {
    const currentOrderId = orderId;
    const tipCents = Math.round(tipAmount * 100);
    pay("card_mock", tipCents).catch((err: unknown) => {
      console.error("Payment API error (prototype — proceeding anyway):", err);
    });
    markApproved(currentOrderId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, lines, totals.subtotal, totals.tax, tipAmount, grandTotal, pay]);

  // ---------------------------------------------------------------------------
  // card_stripe path — Stripe Terminal Web SDK drives the approval
  // ---------------------------------------------------------------------------
  const handleGoToPayStripe = useCallback(async () => {
    if (!orderId || !terminal) return;

    void sendToKitchen();
    setStripeSubtitle("Creating payment…");
    setStep("tap-to-pay");
    setStripeError(null);

    const tipCents = Math.round(tipAmount * 100);
    const currentOrderId = orderId;

    try {
      // 1. Create PaymentIntent on server — returns client_secret
      const response = await createPayment(orderId, "card_stripe", tipCents);
      const clientSecret = response.client_secret;
      if (!clientSecret) throw new Error("Server did not return a client_secret for card_stripe payment");

      setStripeSubtitle("Present card to reader…");

      // 2. Collect via simulated reader
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      const collectResult = await (terminal as any).collectPaymentMethod(clientSecret) as Record<string, unknown>;
      if ("error" in collectResult) {
        const errMsg = ((collectResult.error as Record<string, unknown>)?.message as string) ?? "Collection failed";
        throw new Error(errMsg);
      }

      setStripeSubtitle("Processing payment…");

      // 3. Process (confirm) via terminal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      const processResult = await (terminal as any).processPayment(collectResult["paymentIntent"]) as Record<string, unknown>;
      if ("error" in processResult) {
        const errMsg = ((processResult.error as Record<string, unknown>)?.message as string) ?? "Processing failed";
        throw new Error(errMsg);
      }

      // 4. Success — clear order state and advance to approved
      clearCart();
      saveLastOrder(lines, totals.subtotal, totals.tax, tipAmount, grandTotal);
      setLastOrder(loadLastOrder());
      setPaidOrderId(currentOrderId);
      setStep("approved");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "Payment failed";
      setStripeError(msg);
      setStep("tip-select");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, terminal, lines, totals.subtotal, totals.tax, tipAmount, grandTotal, sendToKitchen, clearCart]);

  // ---------------------------------------------------------------------------
  // Dispatch to correct payment path
  // ---------------------------------------------------------------------------
  const handleGoToPay = () => {
    if (paymentMethod === "card_stripe" && terminal) {
      void handleGoToPayStripe();
    } else {
      handleGoToPayMock();
    }
  };

  // ---------------------------------------------------------------------------
  // Rest of handlers
  // ---------------------------------------------------------------------------
  const handleViewReceipt = () => {
    const order = lastOrder ?? loadLastOrder();
    setLastOrder(order);
    setStep("receipt");
  };

  const handleBackToApproved = () => setStep("approved");
  const handleGoToReceiptPrompt = () => setStep("send-receipt");

  const handleNewOrder = () => {
    clearCart();
    clearLastOrder();
    setSelectedTip("18");
    setCustomTipAmount(0);
    setKeypadValue("");
    setLastOrder(null);
    setPaidOrderId(null);
    setStripeError(null);
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

  const handleKeypadCancel = () => setShowKeypad(false);

  const handleMenuTap = useCallback(
    (item: ApiMenuItem) => { void addItem(item); },
    [addItem]
  );

  const handleIncrement = useCallback(
    (id: string) => { void incrementItem(id); },
    [incrementItem]
  );

  const handleDecrement = useCallback(
    (id: string) => { void decrementItem(id); },
    [decrementItem]
  );

  const handleRemove = useCallback(
    (id: string) => { void removeItem(id); },
    [removeItem]
  );

  const handleClear = useCallback(() => { clearCart(); }, [clearCart]);

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

          {/* Right side: user info + DEMO badge + sign out */}
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
              onClick={signOut}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors duration-100"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <MenuGrid onTap={handleMenuTap} />
          <CartSidebar
            lines={lines}
            totals={totals}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onRemove={handleRemove}
            onClear={handleClear}
            onCharge={handleCharge}
          />
        </div>
      </div>

      {/* Checkout overlay — tip selection + payment method picker */}
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
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          stripeReady={terminalReady}
        />
      )}

      {/* Stripe error banner — shows after failed terminal payment */}
      {step === "tip-select" && stripeError && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full mx-4 px-4 py-3 bg-red-600 text-white text-sm rounded-xl shadow-lg">
          <strong>Payment failed:</strong> {stripeError}
        </div>
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

      {/* Tap to pay — card_mock uses 2.5s auto-timer; card_stripe uses noAutoApprove */}
      {step === "tap-to-pay" && (
        <TapToPayScreen
          grandTotal={grandTotal}
          onApproved={paymentMethod === "card_stripe" ? () => undefined : handleApproved}
          onCancel={handleCancelPay}
          noAutoApprove={paymentMethod === "card_stripe"}
          subtitle={paymentMethod === "card_stripe" ? stripeSubtitle : undefined}
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
          onSendReceipt={handleGoToReceiptPrompt}
        />
      )}

      {/* Receipt prompt — send digital receipt via email / SMS */}
      {step === "send-receipt" && (
        <ReceiptPromptScreen
          orderId={paidOrderId}
          onDone={handleNewOrder}
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
