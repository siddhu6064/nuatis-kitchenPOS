"use client";

import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyHistoryEntry } from "@/lib/api/reports";
import { formatMoney, formatDate } from "@/lib/format";

interface SparklineProps {
  history: DailyHistoryEntry[];
}

interface TooltipPayload {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="text-slate-500 mb-0.5">{formatDate(label)}</p>
      <p className="font-semibold text-slate-900 tabular-nums">
        {formatMoney(payload[0]?.value ?? 0)} net
      </p>
    </div>
  );
}

export function Sparkline({ history }: SparklineProps) {
  const router = useRouter();

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-10 flex items-center justify-center text-sm text-slate-400 text-center">
        No data yet — sparkline appears after the first day of sales.
      </div>
    );
  }

  const data = [...history].reverse();

  function handleClick(entry: { activePayload?: Array<{ payload: DailyHistoryEntry }> }) {
    const date = entry?.activePayload?.[0]?.payload?.date;
    if (date) router.push(`/reports?date=${date}`);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4">
      <p className="text-xs font-mono font-semibold uppercase tracking-widest text-slate-400 mb-3">
        30-Day Net Revenue
      </p>
      <div className="h-[120px] w-full cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={handleClick as Parameters<typeof AreaChart>[0]["onClick"]}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0047FF" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#0047FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => {
                const d = new Date(`${v}T12:00:00Z`);
                return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
              }}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="net_cents"
              stroke="#0047FF"
              strokeWidth={1.5}
              fill="url(#sparkFill)"
              dot={false}
              activeDot={{ r: 3, fill: "#0047FF", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
