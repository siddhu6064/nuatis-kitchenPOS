"use client";

import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

export function ManagerPinModal({
  open,
  title = "Manager approval required",
  description = "Enter a manager or owner PIN to continue.",
  error,
  onSubmit,
  onClose,
}: Props) {
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      onSubmit(next);
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1));
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold text-slate-900">
                {title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-500 mt-1">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? "bg-brand border-brand"
                    : "bg-white border-slate-300"
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          {/* Hidden input for hardware keyboard */}
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(val);
              if (val.length === 4) onSubmit(val);
            }}
            className="sr-only"
            aria-label="Manager PIN"
          />

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2">
            {digits.slice(0, 9).map((d) => (
              <button
                key={d}
                onClick={() => handleDigit(d)}
                className="flex h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xl font-semibold text-slate-800 hover:bg-brand/10 hover:border-brand hover:text-brand active:scale-95 transition-all"
              >
                {d}
              </button>
            ))}
            <button
              onClick={handleBackspace}
              className="flex h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500 hover:bg-slate-100 active:scale-95 transition-all"
            >
              ⌫
            </button>
            <button
              onClick={() => handleDigit("0")}
              className="flex h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xl font-semibold text-slate-800 hover:bg-brand/10 hover:border-brand hover:text-brand active:scale-95 transition-all"
            >
              0
            </button>
            <div />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
