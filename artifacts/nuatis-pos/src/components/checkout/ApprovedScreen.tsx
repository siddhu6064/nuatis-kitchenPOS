import { Check } from "lucide-react";
import { fmt } from "@/lib/tipMath";

interface Props {
  subtotal: number;
  tax: number;
  tip: number;
  grandTotal: number;
  onNewOrder: () => void;
  onViewReceipt: () => void;
  onSendReceipt?: () => void;
}

export function ApprovedScreen({ subtotal, tax, tip, grandTotal, onNewOrder, onViewReceipt, onSendReceipt }: Props) {
  return (
    <div className="fixed inset-0 z-40 bg-emerald-600 flex flex-col items-center justify-center px-6">
      {/* Checkmark */}
      <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6">
        <Check size={48} className="text-white" strokeWidth={3} />
      </div>

      <h1 className="text-white text-4xl font-bold mb-1">Approved</h1>
      <p className="text-emerald-100 text-base mb-8">Payment accepted</p>

      {/* Breakdown card */}
      <div className="bg-white/15 rounded-2xl w-full max-w-sm px-5 py-4 mb-10 space-y-2">
        <div className="flex justify-between text-emerald-50 text-sm">
          <span>Subtotal</span>
          <span className="tabular-nums">${fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-emerald-50 text-sm">
          <span>Tax (8.25%)</span>
          <span className="tabular-nums">${fmt(tax)}</span>
        </div>
        {tip > 0 && (
          <div className="flex justify-between text-emerald-50 text-sm">
            <span>Tip</span>
            <span className="tabular-nums">${fmt(tip)}</span>
          </div>
        )}
        <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-white/20">
          <span>Total</span>
          <span className="tabular-nums">${fmt(grandTotal)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3">
        {onSendReceipt && (
          <button
            onClick={onSendReceipt}
            className="
              w-full py-4 rounded-xl text-base font-semibold
              bg-white text-emerald-700
              hover:bg-emerald-50 active:bg-emerald-100
              transition-colors duration-100
            "
          >
            Send Receipt
          </button>
        )}
        <button
          onClick={onNewOrder}
          className="
            w-full py-4 rounded-xl text-base font-semibold
            bg-white/15 text-white border border-white/30
            hover:bg-white/25 active:bg-white/30
            transition-colors duration-100
          "
        >
          New Order
        </button>
        <button
          onClick={onViewReceipt}
          className="
            w-full py-4 rounded-xl text-base font-semibold
            bg-white/15 text-white border border-white/30
            hover:bg-white/25 active:bg-white/30
            transition-colors duration-100
          "
        >
          View Receipt
        </button>
      </div>
    </div>
  );
}
