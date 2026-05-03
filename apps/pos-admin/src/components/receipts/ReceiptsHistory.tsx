"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReceiptHistoryEntry } from "@/lib/api/receipts-history";
import { getReceiptsHistory, resendReceipt } from "@/lib/api/receipts-history";

interface ReceiptsHistoryProps {
  initialEntries: ReceiptHistoryEntry[];
  initialTotal: number;
  posJwt: string;
  page: number;
  channel: string;
  status: string;
}

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-500 border-slate-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  bounced: "bg-orange-50 text-orange-700 border-orange-200",
};

const CHANNEL_BADGE: Record<string, string> = {
  email: "bg-blue-50 text-blue-700 border-blue-200",
  sms: "bg-violet-50 text-violet-700 border-violet-200",
};

export function ReceiptsHistory({
  initialEntries,
  initialTotal,
  posJwt,
  page,
  channel,
  status,
}: ReceiptsHistoryProps) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const offset = (page - 1) * PAGE_SIZE;

  const { data } = useQuery({
    queryKey: ["receipts", page, channel, status],
    queryFn: () =>
      getReceiptsHistory(posJwt, {
        limit: PAGE_SIZE,
        offset,
        channel: (channel || undefined) as "email" | "sms" | undefined,
        status: (status || undefined) as "queued" | "sent" | "failed" | "bounced" | undefined,
      }),
    initialData: { entries: initialEntries, total_count: initialTotal },
  });

  const entries = data?.entries ?? [];
  const total = data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function navigate(updates: Record<string, string>) {
    const qs = new URLSearchParams();
    const merged = { page: String(page), channel, status, ...updates };
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    router.push(`/receipts?${qs.toString()}`);
  }

  async function handleResend(entry: ReceiptHistoryEntry) {
    if (!entry.order_id) return;
    setResending(entry.id);
    setResendMsg(null);
    try {
      await resendReceipt(posJwt, entry.order_id, entry.channel, entry.recipient);
      setResendMsg("Receipt resent — check status above.");
    } catch (err: unknown) {
      setResendMsg((err as Error).message ?? "Resend failed.");
    } finally {
      setResending(null);
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900">Receipts</h1>
        <p className="mt-1 text-sm text-slate-500">Email and SMS receipt delivery history.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={channel}
          onChange={(e) => navigate({ channel: e.target.value, page: "1" })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <select
          value={status}
          onChange={(e) => navigate({ status: e.target.value, page: "1" })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>
        {(channel || status) && (
          <button
            onClick={() => navigate({ channel: "", status: "", page: "1" })}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Resend banner */}
      {resendMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${
          resendMsg.includes("resent") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {resendMsg}
          <button onClick={() => setResendMsg(null)} className="ml-4 text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Table */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 flex flex-col items-center justify-center gap-2 text-center">
          <p className="font-serif text-lg font-semibold text-slate-600">No receipts yet</p>
          <p className="text-sm text-slate-400">Receipts appear here after customers request email or SMS copies.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Sent", "Order", "Channel", "Recipient", "Status", "Provider ID", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short", day: "numeric",
                        hour: "numeric", minute: "2-digit",
                      }).format(new Date(entry.created_at))}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap tabular-nums font-mono text-xs">
                      {entry.order_number != null ? `#${entry.order_number}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${CHANNEL_BADGE[entry.channel] ?? ""}`}>
                        {entry.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{entry.recipient}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[entry.status] ?? ""}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.provider_message_id ? (
                        <button
                          onClick={() => void copyToClipboard(entry.provider_message_id!, entry.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 font-mono transition-colors"
                          title="Click to copy"
                        >
                          {entry.provider_message_id.slice(0, 10)}…
                          {copied === entry.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.order_id && (
                        <button
                          onClick={() => void handleResend(entry)}
                          disabled={resending === entry.id}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw className={`h-3 w-3 ${resending === entry.id ? "animate-spin" : ""}`} />
                          Resend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ page: String(page - 1) })}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <span className="text-xs text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => navigate({ page: String(page + 1) })}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
