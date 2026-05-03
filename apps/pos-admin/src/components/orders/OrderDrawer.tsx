"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronDown, ChevronRight, AlertTriangle, RotateCcw, Tag, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order, OrderDiscount } from "@nuatis/pos-shared";
import {
  getOrder,
  getOrderAuditTrail,
  voidOrder,
  refundPayment,
  applyDiscount,
  voidDiscount,
  type AuditEntry,
} from "@/lib/api/orders";
import { ManagerPinModal } from "@/components/cash/ManagerPinModal";

const CLIENT_API = "/api/v1";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  fired: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
};

interface Props {
  orderId: string | null;
  posJwt: string;
  onClose: () => void;
  onVoided: () => void;
}

type DiscountType = "pct" | "amt";

export function OrderDrawer({ orderId, posJwt, onClose, onVoided }: Props) {
  const qc = useQueryClient();
  const [auditOpen, setAuditOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);

  // Discount state
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("pct");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountError, setDiscountError] = useState<string | null>(null);
  // PIN state for discount apply
  const [discountPinOpen, setDiscountPinOpen] = useState(false);
  const [discountPinError, setDiscountPinError] = useState<string | null>(null);
  const [pendingDiscountPin, setPendingDiscountPin] = useState<string | null>(null);
  // PIN state for discount void
  const [voidDiscountPinOpen, setVoidDiscountPinOpen] = useState(false);
  const [voidDiscountPinError, setVoidDiscountPinError] = useState<string | null>(null);
  const [pendingVoidDiscountId, setPendingVoidDiscountId] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(posJwt, orderId!),
    enabled: !!orderId,
    staleTime: 0,
  });

  const { data: auditEntries } = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: () => getOrderAuditTrail(posJwt, orderId!),
    enabled: !!orderId && auditOpen,
    staleTime: 0,
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      voidOrder(posJwt, id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      setVoidDialogOpen(false);
      setVoidReason("");
      setVoidError(null);
      onVoided();
    },
    onError: (err: Error) => {
      setVoidError(err.message);
    },
  });

  const cardPayment = order?.payments.find(
    (p) => p.method === "card_stripe" && p.status === "succeeded"
  );
  const canVoid =
    order?.status === "open" || order?.status === "fired";
  const canRefund = order?.status === "paid" && !!cardPayment;
  const canDiscount =
    order?.status === "open" || order?.status === "fired";

  const refundMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      refundPayment(posJwt, paymentId, reason),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      setRefundDialogOpen(false);
      setRefundReason("");
      setRefundError(null);
      const cents = (result.refund.amount_cents / 100).toFixed(2);
      setRefundSuccess(`Refund of $${cents} processed successfully.`);
      setTimeout(() => setRefundSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setRefundError(err.message);
    },
  });

  const applyDiscountMutation = useMutation({
    mutationFn: ({
      pin,
    }: {
      pin: string;
    }) => {
      const val = parseInt(discountValue, 10);
      return applyDiscount(posJwt, orderId!, {
        type: discountType,
        value: discountType === "pct" ? Math.round(val * 100) : Math.round(val * 100),
        reason: discountReason.trim(),
        manager_pin: pin,
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.setQueryData(["order", orderId], result);
      setDiscountPinOpen(false);
      setDiscountPinError(null);
      setPendingDiscountPin(null);
      setDiscountDialogOpen(false);
      setDiscountValue("");
      setDiscountReason("");
      setDiscountError(null);
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "manager_pin_invalid") {
        setDiscountPinError("Incorrect PIN. Try again.");
      } else {
        setDiscountPinOpen(false);
        setDiscountError(err.message);
      }
    },
  });

  const voidDiscountMutation = useMutation({
    mutationFn: ({ applicationId, pin }: { applicationId: string; pin: string }) =>
      voidDiscount(posJwt, orderId!, applicationId, pin),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.setQueryData(["order", orderId], result);
      setVoidDiscountPinOpen(false);
      setVoidDiscountPinError(null);
      setPendingVoidDiscountId(null);
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "manager_pin_invalid") {
        setVoidDiscountPinError("Incorrect PIN. Try again.");
      } else {
        setVoidDiscountPinOpen(false);
        setVoidDiscountPinError(null);
      }
    },
  });

  function handleRefundSubmit() {
    if (!refundReason.trim()) {
      setRefundError("Reason is required");
      return;
    }
    if (!cardPayment) return;
    setRefundError(null);
    refundMutation.mutate({ paymentId: cardPayment.id, reason: refundReason.trim() });
  }

  function handleVoidSubmit() {
    if (!voidReason.trim()) {
      setVoidError("Reason is required");
      return;
    }
    if (!orderId) return;
    setVoidError(null);
    voidMutation.mutate({ id: orderId, reason: voidReason.trim() });
  }

  function handleDiscountFormSubmit() {
    setDiscountError(null);
    const val = parseFloat(discountValue);
    if (!discountValue || isNaN(val) || val <= 0) {
      setDiscountError("Enter a valid positive value.");
      return;
    }
    if (discountType === "pct" && val > 50) {
      setDiscountError("Percentage discount cannot exceed 50%.");
      return;
    }
    if (!discountReason.trim()) {
      setDiscountError("Reason is required.");
      return;
    }
    if (discountReason.trim().length > 200) {
      setDiscountError("Reason must be 200 characters or fewer.");
      return;
    }
    // Open PIN modal to collect manager approval
    setDiscountPinError(null);
    setDiscountPinOpen(true);
  }

  function handleDiscountPinSubmit(pin: string) {
    setPendingDiscountPin(pin);
    applyDiscountMutation.mutate({ pin });
  }

  function handleVoidDiscountClick(discountId: string) {
    setPendingVoidDiscountId(discountId);
    setVoidDiscountPinError(null);
    setVoidDiscountPinOpen(true);
  }

  function handleVoidDiscountPinSubmit(pin: string) {
    if (!pendingVoidDiscountId) return;
    voidDiscountMutation.mutate({ applicationId: pendingVoidDiscountId, pin });
  }

  async function handleResendReceipt() {
    if (!orderId) return;
    await fetch(`${CLIENT_API}/orders/${orderId}/receipts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${posJwt}`,
      },
      body: JSON.stringify({ channel: "email" }),
    });
  }

  const activeDiscounts = order?.discounts?.filter((d: OrderDiscount) => !d.voided_at) ?? [];

  return (
    <>
      <Dialog.Root open={!!orderId} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-white shadow-2xl flex flex-col focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full duration-200">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
                  {order
                    ? `Order #${order.order_number ?? "—"}`
                    : "Order Details"}
                </Dialog.Title>
                {order && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {order.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Opened {fmtDate(order.opened_at)}
                    </span>
                    {order.closed_at && (
                      <span className="text-xs text-slate-400">
                        · Closed {fmtDate(order.closed_at)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  Loading…
                </div>
              )}

              {order && (
                <div className="divide-y divide-slate-100">
                  {/* Items */}
                  <section className="px-6 py-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      Items
                    </h3>
                    <div className="space-y-2">
                      {order.items.length === 0 && (
                        <p className="text-sm text-slate-400">No items</p>
                      )}
                      {order.items.map((item) => {
                        const voided = item.status === "voided";
                        const mods = item.modifiers_json
                          ? (item.modifiers_json as { name?: string }[])
                          : [];
                        return (
                          <div key={item.id} className={voided ? "opacity-50" : ""}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-sm text-slate-800 ${voided ? "line-through" : ""}`}
                                >
                                  {item.qty} × {item.name_snapshot}
                                </span>
                                {mods.length > 0 && (
                                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                    {mods.map((m) => m.name).join(", ")}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`font-tabular text-sm shrink-0 ${voided ? "line-through text-slate-400" : "text-slate-800"}`}
                              >
                                {fmt(item.price_cents * item.qty)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                      <div className="flex justify-between text-sm text-slate-500">
                        <span>Subtotal</span>
                        <span className="font-tabular">
                          {fmt(order.subtotal_cents)}
                        </span>
                      </div>

                      {/* Active discount lines */}
                      {activeDiscounts.map((d: OrderDiscount) => (
                        <div key={d.id} className="flex items-start justify-between text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="text-emerald-600 font-medium">
                              Discount
                            </span>
                            <span className="text-slate-400 text-xs ml-1.5">
                              {d.type === "pct"
                                ? `${((d.value_bps ?? 0) / 100).toFixed(0)}%`
                                : fmt(d.value_cents ?? 0)}{" "}
                              — {d.reason}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-tabular text-emerald-600">
                              -{fmt(d.applied_amount_cents)}
                            </span>
                            {canDiscount && (
                              <button
                                onClick={() => handleVoidDiscountClick(d.id)}
                                className="text-slate-300 hover:text-red-400 transition-colors"
                                title="Void this discount"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Show voided discounts dimmed */}
                      {order.discounts
                        ?.filter((d: OrderDiscount) => !!d.voided_at)
                        .map((d: OrderDiscount) => (
                          <div key={d.id} className="flex justify-between text-sm opacity-40">
                            <span className="line-through text-slate-400">
                              Discount — {d.reason}
                            </span>
                            <span className="font-tabular line-through text-slate-400">
                              -{fmt(d.applied_amount_cents)}
                            </span>
                          </div>
                        ))}

                      <div className="flex justify-between text-sm text-slate-500">
                        <span>Tax</span>
                        <span className="font-tabular">
                          {fmt(order.tax_cents)}
                        </span>
                      </div>
                      {order.tip_cents > 0 && (
                        <div className="flex justify-between text-sm text-slate-500">
                          <span>Tip</span>
                          <span className="font-tabular">
                            {fmt(order.tip_cents)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-semibold text-slate-800 pt-1">
                        <span>Total</span>
                        <span className="font-tabular">
                          {fmt(order.total_cents)}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Payment */}
                  {order.payments.length > 0 && (
                    <section className="px-6 py-4">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                        Payment
                      </h3>
                      {order.payments.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5"
                        >
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600 capitalize">
                              {p.method.replace(/_/g, " ")}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                p.status === "succeeded"
                                  ? "bg-green-100 text-green-700"
                                  : p.status === "voided"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm text-slate-700">
                            <span>Amount</span>
                            <span className="font-tabular">
                              {fmt(p.amount_cents)}
                            </span>
                          </div>
                          {p.tip_cents > 0 && (
                            <div className="flex justify-between text-sm text-slate-500">
                              <span>Tip included</span>
                              <span className="font-tabular">
                                {fmt(p.tip_cents)}
                              </span>
                            </div>
                          )}
                          {p.stripe_payment_intent_id && (
                            <div className="text-xs text-slate-400 font-mono">
                              {p.stripe_payment_intent_id.slice(-6)}
                            </div>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  {/* Audit trail (collapsible) */}
                  <section className="px-6 py-4">
                    <button
                      onClick={() => setAuditOpen((v) => !v)}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
                    >
                      {auditOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Audit trail
                    </button>

                    {auditOpen && (
                      <div className="mt-3 space-y-2">
                        {!auditEntries && (
                          <p className="text-xs text-slate-400">Loading…</p>
                        )}
                        {auditEntries?.length === 0 && (
                          <p className="text-xs text-slate-400">
                            No audit entries
                          </p>
                        )}
                        {auditEntries?.map((entry: AuditEntry) => (
                          <div
                            key={entry.id}
                            className="flex items-start gap-2 text-xs"
                          >
                            <span className="text-slate-400 shrink-0 w-28">
                              {relativeTime(entry.created_at)}
                            </span>
                            <span className="text-slate-600 font-medium">
                              {entry.action.replace(/_/g, " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            {/* Actions footer */}
            {order && (
              <div className="px-6 py-4 border-t border-slate-200 space-y-2">
                {refundSuccess && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    {refundSuccess}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canDiscount && (
                    <button
                      onClick={() => {
                        setDiscountValue("");
                        setDiscountReason("");
                        setDiscountError(null);
                        setDiscountType("pct");
                        setDiscountDialogOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      Apply Discount
                    </button>
                  )}
                  {canVoid && (
                    <button
                      onClick={() => setVoidDialogOpen(true)}
                      className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Void order
                    </button>
                  )}
                  {canRefund && (
                    <button
                      onClick={() => { setRefundReason(""); setRefundError(null); setRefundDialogOpen(true); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Refund
                    </button>
                  )}
                  <button
                    onClick={() => void handleResendReceipt()}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Resend email receipt
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Apply Discount dialog */}
      <Dialog.Root
        open={discountDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setDiscountDialogOpen(false);
            setDiscountValue("");
            setDiscountReason("");
            setDiscountError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                <Tag className="h-4 w-4 text-emerald-600" />
              </div>
              <Dialog.Title className="font-serif text-lg font-semibold text-slate-900">
                Apply Discount
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-sm text-slate-500 mb-4">
              Manager PIN required. Max 50% off. Reason required for audit log.
            </Dialog.Description>

            {/* Discount type */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setDiscountType("pct"); setDiscountValue(""); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  discountType === "pct"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Percentage %
              </button>
              <button
                onClick={() => { setDiscountType("amt"); setDiscountValue(""); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  discountType === "amt"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Fixed Amount $
              </button>
            </div>

            {/* Value input */}
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {discountType === "pct" ? "Percentage (1–50%)" : "Amount ($)"}
            </label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                {discountType === "pct" ? "%" : "$"}
              </span>
              <input
                type="number"
                min="0.01"
                max={discountType === "pct" ? "50" : undefined}
                step={discountType === "pct" ? "1" : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "pct" ? "10" : "5.00"}
                className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                autoFocus
              />
            </div>

            {/* Reason */}
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason
            </label>
            <textarea
              rows={2}
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="e.g. employee comp, senior discount"
              maxLength={200}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 resize-none mb-1"
            />
            <p className="text-xs text-slate-400 mb-4 text-right">
              {discountReason.length}/200
            </p>

            {discountError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {discountError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDiscountDialogOpen(false);
                  setDiscountValue("");
                  setDiscountReason("");
                  setDiscountError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscountFormSubmit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Continue →
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Manager PIN modal — for discount apply */}
      <ManagerPinModal
        open={discountPinOpen}
        title="Manager approval required"
        description="Enter a manager or owner PIN to apply this discount."
        error={discountPinError}
        onSubmit={handleDiscountPinSubmit}
        onClose={() => {
          setDiscountPinOpen(false);
          setDiscountPinError(null);
          setPendingDiscountPin(null);
        }}
      />

      {/* Manager PIN modal — for discount void */}
      <ManagerPinModal
        open={voidDiscountPinOpen}
        title="Void discount"
        description="Enter a manager or owner PIN to remove this discount."
        error={voidDiscountPinError}
        onSubmit={handleVoidDiscountPinSubmit}
        onClose={() => {
          setVoidDiscountPinOpen(false);
          setVoidDiscountPinError(null);
          setPendingVoidDiscountId(null);
        }}
      />

      {/* Refund confirmation dialog */}
      <Dialog.Root
        open={refundDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setRefundDialogOpen(false);
            setRefundReason("");
            setRefundError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <RotateCcw className="h-4 w-4 text-amber-600" />
              </div>
              <Dialog.Title className="font-serif text-lg font-semibold text-slate-900">
                Refund this order?
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-sm text-slate-500 mb-4">
              A full refund will be submitted to Stripe and the platform fee reversed. This cannot be undone.
            </Dialog.Description>

            {cardPayment && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 mb-4">
                <span className="font-medium">{fmt(cardPayment.amount_cents)}</span>
                {" "}via {cardPayment.method.replace(/_/g, " ")}
                {cardPayment.card_last4 && ` ·· ${cardPayment.card_last4}`}
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason
            </label>
            <textarea
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Customer request, duplicate charge"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 resize-none"
              autoFocus
            />

            {refundError && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {refundError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setRefundDialogOpen(false);
                  setRefundReason("");
                  setRefundError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundSubmit}
                disabled={refundMutation.isPending}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
              >
                {refundMutation.isPending ? "Processing…" : "Confirm refund"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Void confirmation dialog */}
      <Dialog.Root
        open={voidDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setVoidDialogOpen(false);
            setVoidReason("");
            setVoidError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <Dialog.Title className="font-serif text-lg font-semibold text-slate-900">
                Void this order?
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-sm text-slate-500 mb-4">
              This will cancel all items and cannot be undone. Provide a reason
              for the audit log.
            </Dialog.Description>

            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason
            </label>
            <textarea
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Customer cancelled"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
              autoFocus
            />

            {voidError && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {voidError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setVoidDialogOpen(false);
                  setVoidReason("");
                  setVoidError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidSubmit}
                disabled={voidMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {voidMutation.isPending ? "Voiding…" : "Confirm void"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
