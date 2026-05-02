import { useState } from "react";
import { sendReceipt } from "@/lib/api/orders";
import type { SendReceiptRequest } from "@/lib/api/types";

interface Props {
  orderId: string | null;
  onDone: () => void;
}

type ReceiptMode = "email" | "sms" | "both";
type Status = "idle" | "submitting" | "sent" | "error";

const OPT_IN_TEXT =
  "I agree to receive a text receipt from this store. " +
  "Reply STOP to opt out. Msg & data rates may apply.";

export function ReceiptPromptScreen({ orderId, onDone }: Props) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const canEmail = email.trim().includes("@");
  const canSms = phone.trim().length >= 7 && smsOptIn;

  async function handleSend(mode: ReceiptMode) {
    if (!orderId) { onDone(); return; }

    const payload: SendReceiptRequest = { sms_opt_in: false };
    if (mode === "email" || mode === "both") {
      if (!canEmail) return;
      payload.email = email.trim();
    }
    if (mode === "sms" || mode === "both") {
      if (!canSms) return;
      payload.phone = phone.trim();
      payload.sms_opt_in = true;
      payload.sms_opt_in_text = OPT_IN_TEXT;
    }

    setStatus("submitting");
    setError(null);
    try {
      await sendReceipt(orderId, payload);
      setStatus("sent");
      setTimeout(onDone, 2000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "sent") {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-serif text-2xl font-semibold text-white mb-2">Receipt sent!</h2>
        <p className="text-slate-400 text-sm">Starting new order…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-md mx-auto w-full">
        {/* Heading */}
        <h2 className="font-serif text-3xl font-semibold text-white mb-2">
          How would you like your receipt?
        </h2>
        <p className="text-slate-400 text-sm mb-8">
          Enter your email, phone, or both below.
        </p>

        {/* Email input */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Email
          </label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="
              w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-800
              text-white placeholder-slate-500 text-base
              focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
              transition-colors duration-100
            "
          />
        </div>

        {/* Phone input */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Phone
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (512) 555-0100"
            className="
              w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-800
              text-white placeholder-slate-500 text-base
              focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
              transition-colors duration-100
            "
          />
        </div>

        {/* TCPA opt-in */}
        {phone.trim().length > 0 && (
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 accent-brand shrink-0"
            />
            <span className="font-mono text-[11px] leading-relaxed text-slate-400">
              {OPT_IN_TEXT}
            </span>
          </label>
        )}

        {/* Error */}
        {status === "error" && error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            onClick={() => { void handleSend("email"); }}
            disabled={!canEmail || status === "submitting"}
            className="
              py-4 rounded-xl text-sm font-semibold transition-all duration-100
              bg-brand text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:bg-blue-600 active:bg-blue-700
            "
          >
            Email
          </button>
          <button
            onClick={() => { void handleSend("sms"); }}
            disabled={!canSms || status === "submitting"}
            className="
              py-4 rounded-xl text-sm font-semibold transition-all duration-100
              bg-brand text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:bg-blue-600 active:bg-blue-700
            "
          >
            Text
          </button>
          <button
            onClick={() => { void handleSend("both"); }}
            disabled={(!canEmail || !canSms) || status === "submitting"}
            className="
              py-4 rounded-xl text-sm font-semibold transition-all duration-100
              bg-brand text-white col-span-2
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:bg-blue-600 active:bg-blue-700
            "
          >
            Both
          </button>
        </div>

        <button
          onClick={onDone}
          disabled={status === "submitting"}
          className="
            w-full py-4 rounded-xl text-sm font-semibold transition-colors duration-100
            bg-slate-800 text-slate-300 border border-slate-700
            hover:bg-slate-700 active:bg-slate-600
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          Skip
        </button>

        {status === "submitting" && (
          <p className="text-center text-slate-400 text-sm mt-4">Sending…</p>
        )}
      </div>
    </div>
  );
}
