import { useEffect, useRef } from "react";
import { fmt } from "@/lib/tipMath";

interface Props {
  grandTotal: number;
  onApproved: () => void;
  onCancel: () => void;
  /**
   * When true, disables the 2500ms auto-approval timer.
   * Use for card_stripe flow where approval is driven by the Stripe Terminal SDK.
   */
  noAutoApprove?: boolean;
  /** Custom subtitle shown below the main label. Defaults to "Processing payment…" */
  subtitle?: string;
}

export function TapToPayScreen({ grandTotal, onApproved, onCancel, noAutoApprove, subtitle }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (noAutoApprove) return;

    timerRef.current = setTimeout(() => {
      onApproved();
    }, 2500);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [onApproved, noAutoApprove]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col items-center justify-center">
      {/* Total — serif, large */}
      <p className="font-serif text-white text-5xl font-semibold tabular-nums mb-10">
        ${fmt(grandTotal)}
      </p>

      {/* Animated pulse rings */}
      <div className="relative flex items-center justify-center mb-10">
        <span className="absolute w-52 h-52 rounded-full bg-brand/15 animate-ping" style={{ animationDuration: "1.8s" }} />
        <span className="absolute w-36 h-36 rounded-full bg-brand/30 animate-ping" style={{ animationDuration: "1.4s", animationDelay: "0.3s" }} />
        <div className="relative w-24 h-24 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-blue-900/40">
          <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
          </svg>
        </div>
      </div>

      <p className="text-slate-300 text-base mb-1">Present card to reader</p>
      <p className="text-slate-500 text-sm mb-12">{subtitle ?? "Processing payment…"}</p>

      <button
        onClick={onCancel}
        className="text-slate-500 text-sm hover:text-slate-300 transition-colors underline underline-offset-2"
      >
        Cancel
      </button>
    </div>
  );
}
