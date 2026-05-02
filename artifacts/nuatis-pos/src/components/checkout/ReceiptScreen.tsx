import { ArrowLeft, Printer, Mail } from "lucide-react";
import { fmt } from "@/lib/tipMath";
import type { LastOrder } from "@/lib/lastOrder";

interface Props {
  order: LastOrder | null;
  onBackToApproved: () => void;
  onNewOrder: () => void;
}

function formatOrderId(timestamp: string): string {
  return "ORD-" + timestamp.replace(/\D/g, "").slice(-6);
}

function formatDateTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(", ", " · ");
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <p className="text-slate-500 text-base mb-6">No recent order found.</p>
      <button
        onClick={onBack}
        className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        Back to menu
      </button>
    </div>
  );
}

export function ReceiptScreen({ order, onBackToApproved, onNewOrder }: Props) {
  if (!order) {
    return <EmptyState onBack={onNewOrder} />;
  }

  const orderId = formatOrderId(order.timestamp);
  const dateTime = formatDateTime(order.timestamp);

  function handlePrint() {
    window.print();
  }

  function handleEmail() {
    alert("Email receipt — coming soon");
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col print:static print:block">
      {/* Action bar — hidden when printing */}
      <div className="print:hidden flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <button
          onClick={onBackToApproved}
          aria-label="Back to approved screen"
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm font-semibold text-slate-700 flex-1">Receipt</span>
        <button
          onClick={handleEmail}
          aria-label="Email receipt"
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <Mail size={18} />
        </button>
        <button
          onClick={handlePrint}
          aria-label="Print receipt"
          className="w-[44px] h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <Printer size={18} />
        </button>
      </div>

      {/* Receipt scroll area */}
      <div className="flex-1 overflow-y-auto bg-slate-100 print:bg-white print:overflow-visible">
        {/* Receipt card */}
        <div
          id="receipt-body"
          className="
            mx-auto my-8 w-full max-w-[360px]
            bg-white shadow-md rounded-lg
            px-6 py-8
            print:shadow-none print:rounded-none print:my-0 print:px-4 print:py-6
            font-mono text-sm text-slate-900
          "
        >
          {/* Header */}
          <div className="text-center mb-6">
            <p className="text-base font-bold tracking-tight">NUATIS POS</p>
            <p className="text-xs text-slate-600 mt-0.5">Demo Cafe</p>
            <p className="text-xs text-slate-500">123 Main St, Austin, TX 78701</p>
            <p className="text-xs text-slate-500">(512) 555-0100</p>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-slate-300 my-4" />

          {/* Order metadata */}
          <div className="space-y-1 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Order</span>
              <span className="font-semibold tabular-nums">{orderId}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Date</span>
              <span className="tabular-nums">{dateTime}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Payment</span>
              <span>Card · Approved</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-slate-300 my-4" />

          {/* Line items */}
          <ul className="space-y-1.5 mb-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between text-xs">
                <span className="flex-1">
                  {item.qty}&nbsp;×&nbsp;{item.name}
                </span>
                <span className="tabular-nums ml-4 shrink-0">${fmt(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="border-t border-dashed border-slate-300 my-4" />

          {/* Totals */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Subtotal</span>
              <span className="tabular-nums">${fmt(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Tax (8.25%)</span>
              <span className="tabular-nums">${fmt(order.tax)}</span>
            </div>
            {order.tip > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Tip</span>
                <span className="tabular-nums">${fmt(order.tip)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 mt-1 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">${fmt(order.total)}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-slate-300 my-4" />

          {/* Footer */}
          <div className="text-center space-y-1">
            <p className="text-xs font-medium">Thank you!</p>
            <p className="text-xs text-slate-400">We appreciate your business.</p>
            <p className="text-xs text-slate-300 mt-3">Powered by Nuatis</p>
          </div>
        </div>
      </div>

      {/* Bottom action bar — hidden when printing */}
      <div className="print:hidden bg-white border-t border-slate-200 px-6 py-4 flex gap-3 shrink-0">
        <button
          onClick={onBackToApproved}
          className="
            flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium
            hover:bg-slate-50 active:bg-slate-100 transition-colors duration-100
          "
        >
          Back to Approved
        </button>
        <button
          onClick={onNewOrder}
          className="
            flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold
            hover:bg-amber-600 active:bg-amber-700 transition-colors duration-100
          "
        >
          New Order
        </button>
      </div>
    </div>
  );
}
