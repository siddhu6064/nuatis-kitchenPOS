# Nuatis POS Admin

Back-office admin portal for Nuatis POS — built with Next.js 14 App Router, Auth.js v5, Tailwind v3, and React Query v5.

## Quick start

```bash
cd apps/pos-admin
cp .env.example .env.local
# fill in NEXTAUTH_SECRET, AUTH_SECRET, POS_API_URL
pnpm dev
```

Visit http://localhost:3001

## Routes

| Path | Status | Description |
|------|--------|-------------|
| `/sign-in` | Live | Email + password sign-in |
| `/sign-up` | Live | Owner self-registration (creates tenant + location) |
| `/` | Live | Dashboard home with real summary cards (sales, orders, cash, KDS) |
| `/menu` | Live | Full menu CRUD (categories, items, modifier groups) |
| `/orders` | Live | Active/Today/History tabs, drill-down drawer, void flow |
| `/cash` | Live | Current shift view, manual events (pay in/out/no sale), close shift |
| `/reports` | Live | Date-aware end-of-day report · 30-day sparkline · CSV download |
| `/staff` | Placeholder | Coming in Batch 16 |
| `/receipts` | Placeholder | Coming in Batch 16 |
| `/settings` | Placeholder | Coming soon |

## Orders screen

- Three-tab view: **Active** (open + fired, auto-refresh 10s), **Today** (paid/voided today), **History** (prior days)
- Click any row → right-side drawer with full order detail: items, modifiers, payment, audit trail (collapsible)
- Void flow: confirmation modal with required reason field → `POST /v1/orders/:id/void`; owner session bypasses PIN
- Components: `OrdersList`, `OrderDrawer`

## Cash drawer screen

- Displays current open shift: opening float, running totals (cash sales, refunds, pay-ins, pay-outs, expected)
- Event timeline: newest first, color-coded by type
- Add cash event → `CashEventDialog` with type select (pay in / pay out / no sale); pay out and no sale trigger manager PIN
- Close shift → `CloseShiftDialog` with closing amount input; inline variance with green/amber/red color coding
- Auto-refresh every 10s via React Query

## Manager PIN modal

`ManagerPinModal` is a reusable component triggered by any `403 manager_pin_required` API response.

- Large 4-digit numpad with hardware keyboard fallback
- Caller passes `onSubmit(pin)` callback; handles retry logic with error state
- Used by: `CashEventDialog` (pay out / no sale), extensible to void/refund flows

## Location switcher

`LocationSwitcher` in the top header reads from `GET /v1/locations` (fetched server-side in `DashboardShell`).
- Single location: renders as plain text
- Multiple locations: dropdown that stores selection in `sessionStorage["pos.active_location_id"]`

## API proxy pattern

All client-side API calls go through `src/app/api/v1/[...path]/route.ts`, which forwards to `POS_API_URL` server-to-server with the `Authorization` header intact. Client components pass `posJwt` from the session as a Bearer token.

## Auth.js v5 setup

- `src/auth.ts` — NextAuth config with Credentials provider; calls `POST /v1/auth/sign-in` on pos-api
- `src/middleware.ts` — protects all routes except `/sign-in`, `/sign-up`, `/api/auth/*`
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handlers
- `src/types/next-auth.d.ts` — module augmentation for `tenant_id`, `role`, `posJwt`

## Sign-up flow

`POST /v1/onboarding/sign-up` (pos-api, no auth) creates:
1. `tenants` row (name, vertical, timezone)
2. `locations` row (auto-default, same name, 8.25% tax)
3. `staff_members` row (role = owner, bcrypt password hash cost 12)

On success, the sign-up page auto-signs-in via `signIn('credentials', ...)`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes | Auth.js JWT signing secret (`openssl rand -base64 32`) |
| `AUTH_SECRET` | Yes | Same as `NEXTAUTH_SECRET` (Auth.js v5 alias — both must be set) |
| `POS_API_URL` | Yes | pos-api base URL, server-to-server (default: `http://localhost:3002`) |
| `NEXTAUTH_URL` | Dev only | Full base URL of this app (Vercel sets this automatically in production) |
| `SENTRY_DSN` | No | Sentry DSN for server-side error capture |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN exposed to the browser (same value as `SENTRY_DSN`) |

## Deployment (Vercel)

### Prerequisites

1. **pos-api deployed** — the admin is a thin Next.js front-end that proxies all data requests to pos-api. Deploy pos-api first and note its public URL.
2. **Sentry project** (optional) — create a project at [sentry.io](https://sentry.io) and copy the DSN.

### Steps

```bash
# 1. Install Vercel CLI (once)
npm i -g vercel

# 2. Link the project (run from repo root)
vercel link

# 3. Set required environment variables in the Vercel dashboard:
#    Project → Settings → Environment Variables
#
#    AUTH_SECRET          = $(openssl rand -base64 32)
#    NEXTAUTH_SECRET      = same value as AUTH_SECRET
#    POS_API_URL          = https://your-pos-api-domain.com
#
#    Optional:
#    SENTRY_DSN           = https://...@...ingest.sentry.io/...
#    NEXT_PUBLIC_SENTRY_DSN = same value as SENTRY_DSN

# 4. Deploy
vercel --prod
```

### Build settings (via vercel.json)

The `vercel.json` in this directory sets:
- **Framework**: Next.js
- **Build command**: `pnpm --filter @nuatis/pos-admin run build`
- **Install command**: `pnpm install --frozen-lockfile`

### Sentry verification

After setting `SENTRY_DSN` and redeploying:

```bash
# Trigger a test error via the proxy route (replace with your Vercel domain)
curl -X GET https://your-admin.vercel.app/api/v1/nonexistent-route
```

Within 30 seconds the event should appear in your Sentry project under **Issues**.
