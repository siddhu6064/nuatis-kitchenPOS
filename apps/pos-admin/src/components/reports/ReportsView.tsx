"use client";

import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { EndOfDayReport, DailyHistoryEntry } from "@/lib/api/reports";
import { MetricCard } from "./MetricCard";
import { Sparkline } from "./Sparkline";
import { BreakdownTable } from "./BreakdownTable";
import { formatMoney, formatPct } from "@/lib/format";

interface ReportsViewProps {
  report: EndOfDayReport;
  history: DailyHistoryEntry[];
  initialDate: string;
  today: string;
}

export function ReportsView({
  report,
  history,
  initialDate,
  today,
}: ReportsViewProps) {
  const router = useRouter();

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;
    if (newDate) router.push(`/reports?date=${newDate}`);
  }

  function handleDownloadCsv() {
    const a = document.createElement("a");
    a.href = `/api/v1/reports/end-of-day.csv?date=${initialDate}`;
    a.download = `report-${initialDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const snapshotBadge = report.is_snapshot ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
      Final · snapshotted{" "}
      {report.snapshot_at
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(report.snapshot_at))
        : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block animate-pulse" />
      Live data
    </span>
  );

  const byMethodColumns = [
    { key: "method" as const, label: "Method", align: "left" as const,
      format: (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") },
    { key: "count" as const, label: "Count", align: "right" as const,
      format: (v: number) => String(v) },
    { key: "gross_cents" as const, label: "Gross", align: "right" as const,
      format: (v: number) => formatMoney(v) },
  ] as Parameters<typeof BreakdownTable<(typeof report.by_method)[number]>>[0]["columns"];

  const byItemColumns = [
    { key: "name" as const, label: "Item", align: "left" as const },
    { key: "qty_sold" as const, label: "Qty", align: "right" as const,
      format: (v: number) => String(v) },
    { key: "gross_cents" as const, label: "Gross", align: "right" as const,
      format: (v: number) => formatMoney(v) },
    { key: "pct_of_total" as const, label: "%", align: "right" as const,
      format: (v: number) => formatPct(v) },
  ] as Parameters<typeof BreakdownTable<(typeof report.by_item)[number]>>[0]["columns"];

  const byStaffColumns = [
    { key: "full_name" as const, label: "Staff", align: "left" as const },
    { key: "ticket_count" as const, label: "Tickets", align: "right" as const,
      format: (v: number) => String(v) },
    { key: "gross_cents" as const, label: "Gross", align: "right" as const,
      format: (v: number) => formatMoney(v) },
    { key: "tips_cents" as const, label: "Tips", align: "right" as const,
      format: (v: number) => formatMoney(v) },
  ] as Parameters<typeof BreakdownTable<(typeof report.by_staff)[number]>>[0]["columns"];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-3xl font-bold text-slate-900">
            Reports
          </h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {snapshotBadge}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="date"
            value={initialDate}
            max={today}
            onChange={handleDateChange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
          <button
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Gross Sales"
          valueCents={report.gross_sales_cents}
          subtext={`${report.order_count} order${report.order_count !== 1 ? "s" : ""}`}
        />
        <MetricCard
          label="Net Revenue"
          valueCents={report.net_cents}
          subtext={`${report.paid_order_count} paid`}
        />
        <MetricCard
          label="Tips"
          valueCents={report.tips_cents}
          subtext={report.voided_order_count > 0 ? `${report.voided_order_count} voided` : undefined}
        />
        <MetricCard
          label="Discounts"
          valueCents={report.discounts_cents}
        />
        <MetricCard
          label="Tax Collected"
          valueCents={report.tax_cents}
        />
      </div>

      {/* Sparkline */}
      <Sparkline history={history} />

      {/* Breakdown tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BreakdownTable
          title="By Payment Method"
          columns={byMethodColumns}
          rows={report.by_method}
        />
        <BreakdownTable
          title="Top Items"
          columns={byItemColumns}
          rows={report.by_item}
        />
        <BreakdownTable
          title="By Staff"
          columns={byStaffColumns}
          rows={report.by_staff}
        />
      </div>
    </div>
  );
}
