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
| `/reports` | Placeholder | Coming in Batch 15 |
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

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Secret for Auth.js JWT signing (openssl rand -base64 32) |
| `AUTH_SECRET` | Same as NEXTAUTH_SECRET (Auth.js v5 alias) |
| `POS_API_URL` | pos-api base URL, server-to-server (default: http://localhost:3002) |
