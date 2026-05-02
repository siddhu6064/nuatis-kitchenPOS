# Nuatis POS — Frontend Prototype

React + Vite + Tailwind CSS tablet POS prototype wired to the `@nuatis/pos-api` backend.

> **Full local dev setup** is documented in the [root README](../../README.md#local-development).

## Quick start

```bash
# From repo root
pnpm install

# Copy env — demo UUIDs are pre-filled, no edits needed for local dev
cp artifacts/nuatis-pos/.env.example artifacts/nuatis-pos/.env

# Start the Vite dev server
pnpm --filter @workspace/nuatis-pos dev
# → http://localhost:5173
```

The sign-in screen appears with the demo Tenant ID and Location ID pre-filled.
Enter PIN `1234` (from `supabase/seed.sql`) to access the POS.

## The API must be running

Signing in and loading the menu both require `apps/pos-api` to be running on `:3002`
with a live Supabase connection. See [root README](../../README.md#local-development).

Without the API:
- Sign-in form renders but PIN submit returns a network error
- Menu grid shows "Could not load menu" error state

## KDS Mode

Navigate to `/kds` (e.g. `http://localhost:5173/kds`) while authenticated to open the
Kitchen Display System — a fullscreen real-time view designed for a wall-mounted iPad.

**How it works:**

1. The KDS subscribes to the Supabase Realtime channel `kitchen:{location_id}` using
   the anon key.
2. When a cashier taps **Charge** on the POS, the app calls
   `POST /v1/orders/:id/send-to-kitchen` which fires an `order_fired` broadcast.
3. A ticket card appears on the KDS grid. Cards are colour-coded by age:
   - **Green** — 0–5 minutes
   - **Yellow** — 5–10 minutes
   - **Red + pulsing** — 10+ minutes
4. Tap any item line to bump it (mark as prepared). When all lines are bumped,
   the card animates out.
5. **Recall Last Bumped** (top bar) restores the previous bump in-memory — useful for
   accidental taps. Note: this is UI-only; the server record is permanent this batch.

**Realtime requirements:**

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set in `.env`
  (from `supabase start` output).
- Broadcast channels are public-by-default (anon key access). Auth-gating
  broadcasts is a future hardening step.
- Without Supabase configured the KDS renders but shows "Waiting for orders…" only.

**Wake Lock:** The KDS requests `navigator.wakeLock.request('screen')` to prevent
the iPad display from sleeping. iOS Safari silently ignores this — no workaround
required; just set auto-lock to Never in iPad Settings.

**Audio:** A short 880 Hz sine-wave chime (Web Audio API) plays on every new ticket.
Tap the speaker icon in the top bar to mute. Setting persists in `localStorage` as
`kds.muted`.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL of pos-api | `http://localhost:3002` |
| `VITE_DEMO_TENANT_ID` | Pre-fills Tenant ID on login screen | `00000000-…-0001` |
| `VITE_DEMO_LOCATION_ID` | Pre-fills Location ID on login screen | `00000000-…-0010` |
| `VITE_DEMO_STAFF_ID` | Demo staff UUID (from seed.sql) | `00000000-…-0020` |
| `VITE_SUPABASE_URL` | Supabase API URL for Realtime (KDS) | `http://localhost:54321` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for KDS channel subscription | _(blank)_ |

All values come from `supabase/seed.sql` and are safe to commit to this dev repo,
except `VITE_SUPABASE_ANON_KEY` which comes from `supabase start` output.
