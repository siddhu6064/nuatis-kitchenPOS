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

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL of pos-api | `http://localhost:3002` |
| `VITE_DEMO_TENANT_ID` | Pre-fills Tenant ID on login screen | `00000000-…-0001` |
| `VITE_DEMO_LOCATION_ID` | Pre-fills Location ID on login screen | `00000000-…-0010` |
| `VITE_DEMO_STAFF_ID` | Demo staff UUID (from seed.sql) | `00000000-…-0020` |

All values come from `supabase/seed.sql` and are safe to commit to this dev repo.
