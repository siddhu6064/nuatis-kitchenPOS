/**
 * Supabase Realtime client for KDS kitchen channel subscription.
 *
 * Architecture notes:
 * - Singleton client: instantiated once per page load, shared across components
 * - Broadcast channels are public-by-default (anon key access)
 *   Auth-gating broadcasts is a future hardening step
 * - The Supabase JS client handles channel re-subscribe on disconnect automatically
 * - Graceful no-op when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set
 *   (dev environment without running Supabase)
 */

import { createClient } from "@supabase/supabase-js";
import {
  KitchenBroadcastEventSchema,
  KitchenBumpEventSchema,
  type KitchenBroadcastEvent,
  type KitchenBumpEvent,
} from "./types";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

// Singleton Supabase client — one instance per page load
let _client: ReturnType<typeof createClient> | null = null;

function getClient(): ReturnType<typeof createClient> | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}

export type KitchenOrderFiredHandler = (event: KitchenBroadcastEvent) => void;
export type KitchenItemBumpedHandler = (event: KitchenBumpEvent) => void;

/**
 * Subscribe to the kitchen broadcast channel for the given location.
 *
 * @param locationId  - The location UUID; channel name = `kitchen:{locationId}`
 * @param onOrderFired  - Called when a new order fires to the kitchen
 * @param onItemBumped  - Called when another station bumps an item (multi-KDS sync)
 * @returns cleanup function — call on component unmount
 */
export function subscribeToKitchen(
  locationId: string,
  onOrderFired: KitchenOrderFiredHandler,
  onItemBumped: KitchenItemBumpedHandler
): () => void {
  const client = getClient();
  if (!client) {
    console.warn(
      "[realtime] Supabase not configured (VITE_SUPABASE_URL missing) — kitchen subscription skipped"
    );
    return () => {
      /* no-op */
    };
  }

  const channelName = `kitchen:${locationId}`;
  const channel = client.channel(channelName);

  channel
    .on("broadcast", { event: "order_fired" }, (msg) => {
      const parsed = KitchenBroadcastEventSchema.safeParse(
        (msg as { payload?: unknown }).payload
      );
      if (!parsed.success) {
        console.warn(
          "[realtime] Malformed order_fired payload — ignoring",
          (msg as { payload?: unknown }).payload,
          parsed.error.flatten()
        );
        return;
      }
      onOrderFired(parsed.data);
    })
    .on("broadcast", { event: "item_bumped" }, (msg) => {
      const parsed = KitchenBumpEventSchema.safeParse(
        (msg as { payload?: unknown }).payload
      );
      if (!parsed.success) {
        console.warn(
          "[realtime] Malformed item_bumped payload — ignoring",
          (msg as { payload?: unknown }).payload,
          parsed.error.flatten()
        );
        return;
      }
      onItemBumped(parsed.data);
    })
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
