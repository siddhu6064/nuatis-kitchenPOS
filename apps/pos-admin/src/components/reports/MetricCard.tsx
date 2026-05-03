import { formatMoney } from "@/lib/format";

interface MetricCardProps {
  label: string;
  valueCents: number;
  subtext?: string;
}

export function MetricCard({ label, valueCents, subtext }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-1.5 shadow-sm">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className="font-serif text-4xl font-bold tabular-nums text-slate-900 leading-none">
        {formatMoney(valueCents)}
      </span>
      {subtext && (
        <span className="text-xs text-slate-400 leading-snug">{subtext}</span>
      )}
    </div>
  );
}
