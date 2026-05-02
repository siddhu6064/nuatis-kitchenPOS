"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, AlertTriangle, CheckCircle } from "lucide-react";
import { closeSession } from "@/lib/api/cash";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

interface Props {
  open: boolean;
  sessionId: string;
  expectedCents: number;
  posJwt: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CloseShiftDialog({
  open,
  sessionId,
  expectedCents,
  posJwt,
  onClose,
  onSuccess,
}: Props) {
  const [closingDollars, setClosingDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const closingCents = Math.round(parseFloat(closingDollars) * 100);
  const varianceCents = isNaN(closingCents)
    ? null
    : closingCents - expectedCents;

  function varianceColor(v: number) {
    if (v === 0) return "text-green-600";
    if (Math.abs(v) <= 500) return "text-amber-600";
    return "text-red-600";
  }

  function varianceBg(v: number) {
    if (v === 0) return "bg-green-50 border-green-200";
    if (Math.abs(v) <= 500) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  }

  async function handleConfirm() {
    if (isNaN(closingCents) || closingCents < 0) {
      setError("Enter a valid closing amount");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await closeSession(posJwt, sessionId, closingCents);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close shift");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setClosingDollars("");
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
              Close shift
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-slate-500 mb-4">
            Count the physical cash in the drawer and enter the total below.
            We&apos;ll calculate any variance for you.
          </Dialog.Description>

          {/* Expected */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex justify-between items-center mb-4">
            <span className="text-sm text-slate-600">Expected in drawer</span>
            <span className="font-tabular text-base font-semibold text-slate-800">
              {fmt(expectedCents)}
            </span>
          </div>

          {/* Closing actual */}
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Actual amount counted
          </label>
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              $
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={closingDollars}
              onChange={(e) => {
                setClosingDollars(e.target.value);
                setError(null);
              }}
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand font-tabular"
              autoFocus
            />
          </div>

          {/* Variance */}
          {varianceCents !== null && closingDollars !== "" && (
            <div
              className={`rounded-xl border px-4 py-3 flex items-center justify-between mb-4 ${varianceBg(varianceCents)}`}
            >
              <div className="flex items-center gap-2">
                {varianceCents === 0 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle
                    className={`h-4 w-4 ${varianceColor(varianceCents)}`}
                  />
                )}
                <span className={`text-sm font-medium ${varianceColor(varianceCents)}`}>
                  {varianceCents === 0
                    ? "Exact match"
                    : varianceCents > 0
                      ? "Over"
                      : "Short"}
                </span>
              </div>
              <span
                className={`font-tabular font-semibold ${varianceColor(varianceCents)}`}
              >
                {varianceCents === 0
                  ? "—"
                  : varianceCents > 0
                    ? `+${fmt(varianceCents)}`
                    : fmt(varianceCents)}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleConfirm()}
              disabled={loading || closingDollars === ""}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 transition-colors"
            >
              {loading ? "Closing…" : "Close shift"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
