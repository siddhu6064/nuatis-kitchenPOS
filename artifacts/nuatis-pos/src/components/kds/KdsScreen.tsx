import "./kds.css";
import { useEffect, useState, useCallback } from "react";
import { TicketCard } from "./TicketCard";
import { RecallBumpedButton } from "./RecallBumpedButton";
import { subscribeToKitchen } from "@/lib/api/realtime";
import type { KitchenBroadcastEvent, KitchenBumpEvent } from "@/lib/api/types";
import { bumpOrderItem } from "@/lib/api/orders";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  modifiers: Array<{ group_name: string; option_name: string }>;
  bumped: boolean;
}

export interface Ticket {
  order_id: string;
  order_number: number;
  opened_at: string;
  location_id: string;
  items: TicketItem[];
  /** true while the card exit-transition plays (200ms) before removal */
  removing: boolean;
}

export interface LastBumped {
  order_id: string;
  item_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a short A5 (880 Hz) sine-wave chime via Web Audio API.
 * 250ms long with exponential decay. Graceful no-op if Web Audio is unavailable
 * (e.g. Safari with strict audio policy, or called before a user gesture).
 */
function playChimeTone(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // Web Audio API unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// KdsScreen
// ---------------------------------------------------------------------------

export function KdsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [muted, setMuted] = useState<boolean>(
    () => localStorage.getItem("kds.muted") === "true"
  );
  const [lastBumped, setLastBumped] = useState<LastBumped | null>(null);

  // Location ID is written to sessionStorage on PIN sign-in
  const locationId = sessionStorage.getItem("pos.location_id") ?? "";

  // ── Chime ─────────────────────────────────────────────────────────────────
  const playChime = useCallback(() => {
    if (!muted) playChimeTone();
  }, [muted]);

  // ── Realtime event handlers ───────────────────────────────────────────────
  const handleOrderFired = useCallback(
    (event: KitchenBroadcastEvent) => {
      const newTicket: Ticket = {
        order_id: event.order_id,
        order_number: event.order_number,
        opened_at: event.opened_at,
        location_id: event.location_id,
        items: event.items.map((i) => ({ ...i, bumped: false })),
        removing: false,
      };
      // Prepend so newest ticket is top-left
      setTickets((prev) => [newTicket, ...prev]);
      playChime();
    },
    [playChime]
  );

  const handleItemBumped = useCallback((event: KitchenBumpEvent) => {
    setTickets((prev) =>
      prev.flatMap((ticket) => {
        if (ticket.order_id !== event.order_id) return [ticket];
        const updatedItems = ticket.items.map((item) =>
          item.id === event.item_id ? { ...item, bumped: true } : item
        );
        const allBumped = updatedItems.every((i) => i.bumped);
        if (allBumped) {
          // Start exit animation then remove from state
          setTimeout(() => {
            setTickets((p) => p.filter((t) => t.order_id !== event.order_id));
          }, 200);
          return [{ ...ticket, items: updatedItems, removing: true }];
        }
        return [{ ...ticket, items: updatedItems }];
      })
    );
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!locationId) return;
    const cleanup = subscribeToKitchen(
      locationId,
      handleOrderFired,
      handleItemBumped
    );
    return cleanup;
  }, [locationId, handleOrderFired, handleItemBumped]);

  // ── Wake Lock — keep screen on ────────────────────────────────────────────
  // iOS Safari ignores Wake Lock API — graceful failure documented here.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    void navigator.wakeLock
      ?.request("screen")
      .then((wl) => {
        wakeLock = wl;
      })
      .catch(() => {
        // Wake Lock not supported (iOS Safari, older browsers) — silently ignore
      });
    return () => {
      void wakeLock?.release();
    };
  }, []);

  // ── Bump item (optimistic) ────────────────────────────────────────────────
  const handleBumpItem = useCallback(
    async (order_id: string, item_id: string) => {
      // Optimistic update — strike through immediately
      setTickets((prev) =>
        prev.flatMap((ticket) => {
          if (ticket.order_id !== order_id) return [ticket];
          const updatedItems = ticket.items.map((item) =>
            item.id === item_id ? { ...item, bumped: true } : item
          );
          const allBumped = updatedItems.every((i) => i.bumped);
          if (allBumped) {
            setTimeout(() => {
              setTickets((p) => p.filter((t) => t.order_id !== order_id));
            }, 200);
            return [{ ...ticket, items: updatedItems, removing: true }];
          }
          return [{ ...ticket, items: updatedItems }];
        })
      );
      setLastBumped({ order_id, item_id });

      try {
        await bumpOrderItem(order_id, item_id);
      } catch {
        // Rollback optimistic update on API failure
        setTickets((prev) =>
          prev.map((ticket) => {
            if (ticket.order_id !== order_id) return ticket;
            return {
              ...ticket,
              items: ticket.items.map((item) =>
                item.id === item_id ? { ...item, bumped: false } : item
              ),
              removing: false,
            };
          })
        );
        setLastBumped(null);
      }
    },
    []
  );

  // ── Recall last bumped (client-side only — no server-side un-bump this batch) ──
  const handleRecall = useCallback(() => {
    if (!lastBumped) return;
    const { order_id, item_id } = lastBumped;
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.order_id !== order_id) return ticket;
        return {
          ...ticket,
          removing: false,
          items: ticket.items.map((item) =>
            item.id === item_id ? { ...item, bumped: false } : item
          ),
        };
      })
    );
    setLastBumped(null);
  }, [lastBumped]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("kds.muted", String(next));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Kitchen Display
          {locationId && (
            <span className="ml-2 text-zinc-600">
              · {locationId.slice(-4).toUpperCase()}
            </span>
          )}
        </span>

        <div className="flex items-center gap-2">
          <RecallBumpedButton lastBumped={lastBumped} onRecall={handleRecall} />

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            title={muted ? "Unmute chime" : "Mute chime"}
            aria-label={muted ? "Unmute chime" : "Mute chime"}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Ticket grid */}
      <div className="flex-1 p-4 overflow-auto">
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <p className="font-mono text-zinc-600 text-lg">
              Waiting for orders…
            </p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.order_id}
                ticket={ticket}
                onBumpItem={handleBumpItem}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
