"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { CashEventType } from "@nuatis/pos-shared";
import { logCashEvent } from "@/lib/api/cash";
import { ManagerPinModal } from "./ManagerPinModal";

const EVENT_TYPE_LABELS: Record<string, string> = {
  pay_in: "Pay in",
  pay_out: "Pay out",
  no_sale: "No sale",
};

const MANAGER_REQUIRED_TYPES: CashEventType[] = ["pay_out", "no_sale"];

interface Props {
  open: boolean;
  sessionId: string;
  posJwt: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ApiError = Error & { code?: string };

export function CashEventDialog({
  open,
  sessionId,
  posJwt,
  onClose,
  onSuccess,
}: Props) {
  const [type, setType] = useState<CashEventType>("pay_in");
  const [amountDollars, setAmountDollars] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType("pay_in");
      setAmountDollars("");
      setReason("");
      setError(null);
      setPinModalOpen(false);
      setPinError(null);
    }
  }, [open]);

  async function submit(managerPin?: string) {
    setError(null);
    const cents = Math.round(parseFloat(amountDollars) * 100);
    if (isNaN(cents) || cents < 0) {
      setError("Enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      await logCashEvent(
        posJwt,
        sessionId,
        { type, amount_cents: cents, reason: reason.trim() || undefined },
        managerPin
      );
      setPinModalOpen(false);
      onSuccess();
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === "manager_pin_required") {
        setPinModalOpen(true);
      } else if (apiErr.code === "manager_pin_invalid") {
        setPinError("Incorrect PIN. Try again.");
      } else {
        setError(apiErr.message);
        setPinModalOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePinSubmit(pin: string) {
    setPinError(null);
    void submit(pin);
  }

  function handleSave() {
    void submit();
  }

  const needsPin = MANAGER_REQUIRED_TYPES.includes(type);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
                Add cash event
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["pay_in", "pay_out", "no_sale"] as CashEventType[]).map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          type === t
                            ? "bg-brand text-white border-brand"
                            : "bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand"
                        }`}
                      >
                        {EVENT_TYPE_LABELS[t]}
                      </button>
                    )
                  )}
                </div>
                {needsPin && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    Manager PIN required for this event type.
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand font-tabular"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Reason{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Petty cash for supplies"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 transition-colors"
              >
                {loading ? "Saving…" : "Save event"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ManagerPinModal
        open={pinModalOpen}
        title="Manager PIN required"
        description={`${EVENT_TYPE_LABELS[type] ?? type} events require manager approval.`}
        error={pinError}
        onSubmit={handlePinSubmit}
        onClose={() => {
          setPinModalOpen(false);
          setPinError(null);
        }}
      />
    </>
  );
}
