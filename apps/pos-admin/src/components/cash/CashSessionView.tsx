"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import type { CashEventType } from "@nuatis/pos-shared";
import { getSession, type CashSessionWithEvents } from "@/lib/api/cash";
import { CashEventDialog } from "./CashEventDialog";
import { CloseShiftDialog } from "./CloseShiftDialog";
import { useRouter } from "next/navigation";

const EVENT_TYPE_COLORS: Record<string, string> = {
  pay_in: "bg-green-100 text-green-700",
  pay_out: "bg-red-100 text-red-700",
  no_sale: "bg-slate-100 text-slate-600",
  cash_sale: "bg-blue-100 text-blue-700",
  cash_refund: "bg-orange-100 text-orange-700",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  pay_in: "Pay in",
  pay_out: "Pay out",
  no_sale: "No sale",
  cash_sale: "Cash sale",
  cash_refund: "Cash refund",
};

function fmt(cents: number) {
  const sign = cents < 0 ? "-$" : "$";
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function computeRunningTotal(
  events: CashSessionWithEvents["events"],
  openingFloat: number
): {
  cashSales: number;
  cashRefunds: number;
  payIns: number;
  payOuts: number;
  expected: number;
} {
  let cashSales = 0;
  let cashRefunds = 0;
  let payIns = 0;
  let payOuts = 0;

  for (const e of events) {
    if (e.type === "cash_sale") cashSales += e.amount_cents;
    else if (e.type === "cash_refund") cashRefunds += e.amount_cents;
    else if (e.type === "pay_in") payIns += e.amount_cents;
    else if (e.type === "pay_out") payOuts += e.amount_cents;
  }

  const expected = openingFloat + cashSales - cashRefunds + payIns - payOuts;
  return { cashSales, cashRefunds, payIns, payOuts, expected };
}

interface Props {
  initialSession: CashSessionWithEvents;
  posJwt: string;
}

export function CashSessionView({ initialSession, posJwt }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const { data: session } = useQuery<CashSessionWithEvents>({
    queryKey: ["cash-session", initialSession.id],
    queryFn: () => getSession(posJwt, initialSession.id),
    initialData: initialSession,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const totals = computeRunningTotal(
    session.events ?? [],
    session.opening_float_cents
  );

  function refreshSession() {
    void qc.invalidateQueries({ queryKey: ["cash-session", session.id] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-serif text-lg font-semibold text-slate-900">
              Active shift
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Opened {relativeTime(session.opened_at)} · Float{" "}
              <span className="font-tabular font-medium text-slate-700">
                {fmt(session.opening_float_cents)}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEventDialogOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add cash event
            </button>
            <button
              onClick={() => setCloseDialogOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close shift
            </button>
          </div>
        </div>
      </div>

      {/* Running totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Cash sales", value: totals.cashSales, positive: true },
          { label: "Cash refunds", value: -totals.cashRefunds, positive: false },
          { label: "Pay-ins", value: totals.payIns, positive: true },
          { label: "Pay-outs", value: -totals.payOuts, positive: false },
          { label: "Expected total", value: totals.expected, positive: totals.expected >= 0, highlight: true },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`rounded-xl border p-4 ${
              highlight
                ? "border-brand/20 bg-brand/5"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
            <p
              className={`font-tabular text-lg font-semibold ${
                highlight ? "text-brand" : "text-slate-800"
              }`}
            >
              {fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Event timeline */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            Events
          </span>
          <span className="text-xs text-slate-400">
            {session.events.length} events
          </span>
        </div>

        {session.events.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center gap-2">
            <X className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">No events recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...session.events].reverse().map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span className="text-xs text-slate-400 w-16 shrink-0">
                  {fmtTime(event.created_at)}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${EVENT_TYPE_COLORS[event.type] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {EVENT_TYPE_LABELS[event.type] ?? event.type}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-500 truncate">
                  {event.reason ?? "—"}
                </span>
                <span
                  className={`font-tabular text-sm shrink-0 font-medium ${
                    (event.type as CashEventType) === "pay_out" ||
                    (event.type as CashEventType) === "cash_refund"
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {(event.type as CashEventType) === "pay_out" ||
                  (event.type as CashEventType) === "cash_refund"
                    ? `-${fmt(event.amount_cents)}`
                    : `+${fmt(event.amount_cents)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CashEventDialog
        open={eventDialogOpen}
        sessionId={session.id}
        posJwt={posJwt}
        onClose={() => setEventDialogOpen(false)}
        onSuccess={() => {
          setEventDialogOpen(false);
          refreshSession();
        }}
      />

      <CloseShiftDialog
        open={closeDialogOpen}
        sessionId={session.id}
        expectedCents={totals.expected}
        posJwt={posJwt}
        onClose={() => setCloseDialogOpen(false)}
        onSuccess={() => {
          setCloseDialogOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
