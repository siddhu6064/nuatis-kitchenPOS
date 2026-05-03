"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ChevronRight, ChevronLeft } from "lucide-react";
import type { AuditEntry } from "@/lib/api/audit-log";
import { buildCsvExportUrl } from "@/lib/api/audit-log";

interface Filters {
  action_type: string;
  staff_id: string;
  from: string;
  to: string;
}

interface AuditLogViewProps {
  entries: AuditEntry[];
  nextCursor: string | null;
  userRole: "owner" | "manager";
  initialFilters: Filters;
  staffList: Array<{ id: string; full_name: string; role: string }>;
  distinctActionTypes: string[];
  currentCursor?: string;
}

export function AuditLogView({
  entries,
  nextCursor,
  userRole,
  initialFilters,
  staffList,
  distinctActionTypes,
  currentCursor,
}: AuditLogViewProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Cursor stack enables "previous page" navigation
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  function buildParams(overrides: Partial<Filters & { cursor?: string }>): string {
    const merged = { ...filters, ...overrides };
    const p = new URLSearchParams();
    if (merged.action_type) p.set("action_type", merged.action_type);
    if (merged.staff_id) p.set("staff_id", merged.staff_id);
    if (merged.from) p.set("from", merged.from);
    if (merged.to) p.set("to", merged.to);
    if ("cursor" in overrides && overrides.cursor) p.set("cursor", overrides.cursor);
    return p.toString();
  }

  function handleApply() {
    setCursorStack([]);
    router.push(`/audit?${buildParams({})}`);
  }

  function handleNext() {
    if (!nextCursor) return;
    if (currentCursor) setCursorStack((s) => [...s, currentCursor]);
    router.push(`/audit?${buildParams({ cursor: nextCursor })}`);
  }

  function handlePrev() {
    const stack = [...cursorStack];
    const prev = stack.pop();
    setCursorStack(stack);
    router.push(`/audit?${buildParams({ cursor: prev ?? undefined })}`);
  }

  function handleExportCsv() {
    window.location.href = buildCsvExportUrl(filters);
  }

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl px-4 py-3">
        {/* Action type */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-slate-500">Action type</label>
          <select
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-700 bg-white"
            value={filters.action_type}
            onChange={(e) => setFilters((f) => ({ ...f, action_type: e.target.value }))}
          >
            <option value="">All actions</option>
            {distinctActionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Staff member */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-slate-500">Staff member</label>
          <select
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-700 bg-white"
            value={filters.staff_id}
            onChange={(e) => setFilters((f) => ({ ...f, staff_id: e.target.value }))}
          >
            <option value="">All staff</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-700"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-700"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>

        <button
          onClick={handleApply}
          className="px-4 py-1.5 bg-brand text-white rounded-md text-sm font-medium hover:bg-brand/90 transition-colors"
        >
          Apply
        </button>

        {/* CSV export — owner only */}
        {userRole === "owner" && (
          <button
            onClick={handleExportCsv}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 border border-slate-200 text-slate-600 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {entries.length === 0 ? (
        <div className="border border-slate-200 rounded-xl p-16 text-center">
          <p className="text-slate-400 text-sm">No audit entries found for the selected filters.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Staff
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Target
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  IP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    onClick={() => toggleRow(entry.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500">
                      {new Date(entry.occurred_at).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {entry.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {entry.staff_name ?? (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {entry.target_type ? (
                        <>
                          <span className="text-slate-600">{entry.target_type}</span>
                          {entry.target_id && (
                            <span className="ml-1.5 text-slate-400">
                              {entry.target_id.slice(0, 8)}…
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {entry.ip_address ?? "—"}
                    </td>
                  </tr>

                  {/* Expanded payload row */}
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-expand`}>
                      <td colSpan={5} className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                        <p className="text-xs font-medium text-slate-500 mb-2">Payload</p>
                        <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap overflow-auto max-h-64 bg-white border border-slate-200 rounded-lg p-3 leading-relaxed">
                          {entry.payload !== null
                            ? JSON.stringify(entry.payload, null, 2)
                            : "null"}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      <div className="flex items-center justify-end gap-3">
        {cursorStack.length > 0 && (
          <button
            onClick={handlePrev}
            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
        )}
        {nextCursor && (
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
