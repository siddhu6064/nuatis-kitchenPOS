# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (pos-api) + Next.js 14 App Router (pos-admin)
- **Database**: PostgreSQL via Supabase (pos-api)
- **Validation**: Zod
- **Admin auth**: Auth.js v5 (Credentials + session JWT)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @nuatis/pos-api run test` — run pos-api test suite (148 passing, 57 skip without Supabase)
- `pnpm --filter @nuatis/pos-shared run build` — rebuild shared Zod schemas

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Nuatis POS (`artifacts/nuatis-pos`)
- React + Vite, TypeScript, Tailwind CSS
- Preview path: `/`
- Replit Auth gated (OIDC via `@workspace/replit-auth-web`)
- Cafe POS prototype — menu grid + cart sidebar
- 12 hardcoded menu items in `src/data/menu.ts`
- Cart persisted to localStorage under `nuatis_pos_cart_v1`
- Tax rate: 8.25%

### API Server (`artifacts/api-server`)
- Express 5 + Drizzle ORM (separate registered artifact, port 8080)
- Auth routes: `/api/login`, `/api/callback`, `/api/logout`, `/api/auth/user`
- Sessions stored in PostgreSQL (`sessions` table via `replit-auth` schema)

### POS API (`apps/pos-api`) — core business logic server (port 3002)
- Express ESM TypeScript, 14 Supabase migrations
- **Routes**: auth, onboarding, menu, orders (+ KDS + audit-trail + payments + refunds), cash, reports, locations, receipts (send + view + history), staff, settings, stripe (onboarding + terminal + webhook)
- **Batch 16** added: `GET/POST/PATCH/DELETE /v1/staff`, `GET /v1/receipts` (paginated history), `GET /v1/settings`, `PATCH /v1/settings/tenant` (owner-only), `PATCH /v1/settings/locations/:id`
- **Batch 17** added: `POST /v1/stripe/onboarding/start`, `GET /v1/stripe/onboarding/status`, `POST /v1/stripe/terminal/connection_token`, `GET /v1/stripe/terminal/readers`, `POST /v1/webhooks/stripe` (raw body, sig-verified), `POST /v1/payments/:id/refund` (manager-pin gate + idempotency), `POST /v1/orders/:id/payments` extended with card_stripe branch
- Stripe webhook mounted BEFORE express.json() for raw body access; all Stripe vars optional → mock mode
- All external services (Upstash Redis, Resend, Telnyx, Stripe) optional — graceful mock mode
- **Batch 18** added: `GET /v1/terminals`, `POST /v1/terminals/register` (owner/manager only; real mode validates reader against Connect account; mock mode accepts blindly); webhook-dedup unit tests (2 new tests); refund contract tests (2 new tests)
- **Batch 19** added: Sentry instrumentation (`@sentry/node`); boot-time structured JSON logger (`src/lib/boot-logger.ts`, zero deps); health endpoint rewritten to env-presence flags (no outbound calls); `SENTRY_DSN` optional field added to env schema; `.env.example` fully documented with all 17 env vars
- **158 tests passing** (57 skip without Supabase, 1 todo) across 25 test files

### pos-shared (`packages/pos-shared`)
- Composite TypeScript library — Zod schemas shared between pos-api and pos-admin
- **Schemas**: auth, cash, common, menu, orders, receipts, receipts-history, reports, settings, staff, stripe (new)
- `StaffResponseSchema` (with `active`, `has_pin`), `InviteStaffRequestSchema`, `UpdateStaffRequestSchema`
- `ReceiptHistoryEntrySchema`, `ReceiptHistoryResponseSchema`, `ListReceiptsQuerySchema`
- `TenantSettingsSchema`, `LocationSettingsSchema`, `SettingsResponseSchema`, `TimezoneSchema`
- `StripeAccountStatusSchema`, `CreateOnboardingLinkResponseSchema`, `CreateConnectionTokenResponseSchema`, `STRIPE_HANDLED_EVENTS`
- `PaymentMethodSchema` now includes `"card_stripe"` in addition to cash/card_mock/card_present/card_not_present
- `PaymentSchema` extended with `stripe_charge_id`, `application_fee_cents`, `card_brand`, `card_last4`

### POS Admin (`apps/pos-admin`) — Next.js admin portal (port 3001)
- Next.js 14 App Router, Auth.js v5, Tailwind v3, React Query v5, Radix UI
- Stack: session JWT (`posJwt`, `role`) stored in Auth.js session; server components prefetch → client React Query re-hydrates
- Session user has `role: "owner" | "manager"` and `posJwt: string`
- **Batch 19** added: `@sentry/nextjs` instrumentation (client/server/edge config files); `next.config.mjs` wrapped with `withSentryConfig` (source maps disabled, no auth token needed); `vercel.json` with framework hint + build command; `.env.example` updated with Sentry vars; Deployment section added to README
- **Pages**: dashboard, menu, orders, cash, reports, **staff** (B16), **receipts** (B16), **settings** (B16), **devices** (B18)
- **Staff page**: table with role/status badges, active toggle (self-deactivate + last-owner guard), Invite/Edit dialog
- **Receipts page**: paginated email+SMS history, channel/status filters, click-to-copy provider ID, resend button
- **Settings page**: Stripe Connect section (owner-only Connect button, status badges), tenant section, per-location section, sales tax input
- **Devices page** (B18): table of registered Stripe Terminal readers from DB; "Register new reader" modal → `POST /api/v1/terminals/register`
- **Orders drawer** (B18): Refund button visible on `status=paid` orders with a `card_stripe` payment; amber confirm dialog → `POST /api/v1/payments/:id/refund`; 5 s success banner on completion
- **Batch 17** added: `startStripeOnboarding()`, `getStripeStatusServer()`, `listStripeReaders()` in `src/lib/api/stripe.ts`

## Database Migrations (Supabase)

| File | Purpose |
|------|---------|
| `20260502120000_init_foundation.sql` | Core tables: tenants, locations, staff_members, contacts, orders, order_items, order_payments, terminals, audit_log |
| `20260502120700_staff_password_hash.sql` | `password_hash` on staff_members for session login |
| `20260502130000_menu.sql` | menu_categories, menu_items, modifier_groups, modifiers |
| `20260502140000_kds.sql` | kds_tickets, kds_items, KDS workflow |
| `20260502150000_cash.sql` | cash_drawers, cash_sessions, cash_transactions |
| `20260502160000_receipts.sql` | email_messages, sms_messages, TCPA columns on contacts |
| `20260502161000_receipt_token_index.sql` | Index for receipt token lookup |
| `20260502162000_order_number.sql` | Auto-increment order_number per tenant |
| `20260502163000_payments_v2.sql` | order_payments refactor + payment_provider_log |
| `20260502165000_audit_log.sql` | audit_log table |
| `20260502170000_reports_daily.sql` | daily_sales_summaries, eod_rollups, `email_daily_report` + `daily_report_recipient_email` on tenants |
| `20260502175000_reports_v2.sql` | Timezone-aware reporting helpers |
| `20260502180000_staff_active.sql` | `active boolean NOT NULL DEFAULT true` on staff_members + index |
| `20260502190000_stripe_connect.sql` | `stripe_account_id`, `stripe_charges_enabled`, `stripe_payouts_enabled`, `application_fee_bps` on tenants; `stripe_charge_id`, `application_fee_refund_cents` on payments/refunds |
| `20260503000000_terminal_readers.sql` | `stripe_terminal_readers` table (id, tenant_id, stripe_reader_id, label, location_id, last_seen_at) |

## Auth

- **POS Admin**: Auth.js v5 Credentials provider → hits `POST /v1/auth/sign-in` on pos-api → stores `posJwt` + `role` in session JWT
- **POS terminal**: terminal JWT signed by `signTerminalJwt` — kind="terminal", carries `location_id` + `staff_id`
- **Session JWT**: kind="session", carries `user_id` + `role` (owner|manager) — used by admin routes

## Stripe Integration (Batch 17)

- **Mode**: Test mode only, simulated reader — no real hardware required
- **API lib**: `apps/pos-api/src/lib/stripe.ts` — Stripe singleton (`getStripe()`) + `createPaymentIntent()` + `createConnectionToken()`
- **Idempotency**: `apps/pos-api/src/lib/idempotency.ts` — guards refund endpoint
- **Webhook**: `POST /v1/webhooks/stripe` handles `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` — must remain mounted BEFORE `express.json()`
- **Refunds**: `POST /v1/payments/:id/refund` — requires manager-pin JWT, calls Stripe Refunds API, inserts idempotency key
- **card_stripe payment flow**: POST /v1/orders/:id/payments with method=card_stripe → returns `client_secret` → POS calls `terminal.collectPaymentMethod(clientSecret)` → `terminal.processPayment(pi)` → webhook confirms order
- **POS frontend**: `StripeTerminalProvider` wraps the app; `CheckoutOverlay` shows payment method toggle (Mock Card | Stripe Terminal) when `onPaymentMethodChange` prop provided; `TapToPayScreen` accepts `noAutoApprove` to skip timer
- **Admin frontend**: Settings → Payments shows Connect button (owner-only), status badge (ready/incomplete/not started)
- **Mock mode** (no STRIPE_SECRET_KEY): payment_intent IDs use `pi_mock_*` prefix; terminal always reports `isReady: false`
- **Env vars**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLATFORM_ACCOUNT_ID`, `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`

## Important Constraints

## Sentry Integration (Batch 19)

- **pos-api**: `@sentry/node` — `src/lib/sentry.ts` initializes on module load when `SENTRY_DSN` is set; no-op when absent. Error handler captures exceptions with `tenant_id`/`user_id` scope via `Sentry.withScope()`. Only 5xx errors are reported.
- **pos-admin**: `@sentry/nextjs` — `sentry.client.config.ts` (reads `NEXT_PUBLIC_SENTRY_DSN`), `sentry.server.config.ts`, `sentry.edge.config.ts` (both read `SENTRY_DSN`). `next.config.mjs` wrapped with `withSentryConfig`. Source map upload disabled (add `SENTRY_AUTH_TOKEN` post-deploy to enable).
- **Boot-time logger**: `apps/pos-api/src/lib/boot-logger.ts` — zero-dep, emits `{ts, level, msg, ...ctx}` JSON to stderr in production, prefixed text in dev. Used by `env.ts` for startup warnings. Main request logger remains pino (already emits JSON in production).
- **Health endpoint**: `GET /v1/health` returns `{ok, version, timestamp, services: {db, redis, stripe, resend, telnyx, sentry}}` — each flag is `"configured"` or `"mock"` based on env var presence. No outbound connections, responds in <10 ms.

## Important Constraints

- `@radix-ui/react-tabs` is NOT installed — use native `<button>` tabs or other Radix primitives
- No `date-fns` — use `Intl.DateTimeFormat` for all date formatting
- `sms_messages.status` has NO 'bounced' value (only queued/sent/failed) — email_messages has all 4
- `req.auth` in pos-api is a discriminated union — always narrow with `req.auth.kind === "session"` before accessing `user_id`
- pos-admin client API calls use `CLIENT_API = "/api/v1"` (relative, browser-side); server-side calls use `POS_API_URL` env var
- Stripe webhook MUST stay mounted before `express.json()` in `apps/pos-api/src/index.ts` or signature verification will fail
