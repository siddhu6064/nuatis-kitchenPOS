import { useState, useEffect } from "react";
import type { Ticket } from "./KdsScreen";

interface Props {
  ticket: Ticket;
  onBumpItem: (order_id: string, item_id: string) => Promise<void>;
}

type BorderAge = "green" | "yellow" | "red";

function getAgeColor(openedAt: string): BorderAge {
  const ageMinutes = (Date.now() - new Date(openedAt).getTime()) / 60_000;
  if (ageMinutes < 5) return "green";
  if (ageMinutes < 10) return "yellow";
  return "red";
}

function getRelativeTime(openedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const BORDER_STYLE: Record<BorderAge, string> = {
  green: "border-green-500",
  yellow: "border-yellow-400",
  red: "border-red-500",
};

export function TicketCard({ ticket, onBumpItem }: Props) {
  const [ageColor, setAgeColor] = useState<BorderAge>(() =>
    getAgeColor(ticket.opened_at)
  );
  const [relTime, setRelTime] = useState(() =>
    getRelativeTime(ticket.opened_at)
  );
  const [bumpingIds, setBumpingIds] = useState<Set<string>>(new Set());

  // Refresh age colour and relative time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setAgeColor(getAgeColor(ticket.opened_at));
      setRelTime(getRelativeTime(ticket.opened_at));
    }, 30_000);
    return () => clearInterval(interval);
  }, [ticket.opened_at]);

  const handleTapItem = async (item_id: string) => {
    if (bumpingIds.has(item_id)) return;
    setBumpingIds((prev) => new Set([...prev, item_id]));
    try {
      await onBumpItem(ticket.order_id, item_id);
    } finally {
      setBumpingIds((prev) => {
        const next = new Set(prev);
        next.delete(item_id);
        return next;
      });
    }
  };

  const unbumpedCount = ticket.items.filter((i) => !i.bumped).length;

  return (
    <div
      className={[
        "rounded-xl border-2 bg-zinc-900 p-4 flex flex-col gap-3 transition-all duration-200",
        BORDER_STYLE[ageColor],
        ageColor === "red" ? "kds-border-pulse" : "",
        ticket.removing ? "opacity-0 scale-95" : "opacity-100 scale-100",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ minHeight: "140px" }}
    >
      {/* Header: order number + relative time */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-3xl font-bold text-white leading-none">
          #{ticket.order_number}
        </span>
        <span className="font-mono text-xs text-zinc-500 shrink-0">
          {relTime}
        </span>
      </div>

      {/* Item lines — tap to bump, minimum 60px touch target */}
      <div className="flex flex-col gap-1">
        {ticket.items.map((item) => {
          const isBumping = bumpingIds.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => {
                void handleTapItem(item.id);
              }}
              disabled={item.bumped}
              aria-label={
                item.bumped
                  ? `${item.name} — bumped`
                  : `Bump ${item.name}`
              }
              className={[
                "text-left flex flex-col gap-0.5 py-2 px-2 rounded-lg transition-all",
                "min-h-[60px] justify-center",
                item.bumped
                  ? "opacity-40 cursor-default"
                  : isBumping
                    ? "opacity-60 cursor-wait"
                    : "hover:bg-zinc-800 active:scale-95 cursor-pointer",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className={[
                  "text-white font-medium text-base leading-snug",
                  item.bumped ? "line-through" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {item.quantity}× {item.name}
              </span>

              {item.modifiers.length > 0 && (
                <span className="font-mono text-xs text-zinc-500 leading-tight">
                  {item.modifiers
                    .map((m) => `${m.group_name}: ${m.option_name}`)
                    .join(" · ")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: remaining count hint */}
      {unbumpedCount > 0 && (
        <p className="font-mono text-[10px] text-zinc-700 mt-auto pt-1">
          {unbumpedCount} item{unbumpedCount !== 1 ? "s" : ""} remaining · tap
          to bump
        </p>
      )}
    </div>
  );
}
