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
- `pnpm --filter @nuatis/pos-api run test` — run pos-api test suite (134 passing, 55 skip without Supabase)
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
- **Routes**: auth, onboarding, menu, orders (+ KDS + audit-trail), cash, reports, locations, receipts (send + view + history), staff, settings
- **Batch 16** added: `GET/POST/PATCH/DELETE /v1/staff`, `GET /v1/receipts` (paginated history), `GET /v1/settings`, `PATCH /v1/settings/tenant` (owner-only), `PATCH /v1/settings/locations/:id`
- All external services (Upstash Redis, Resend, Telnyx) optional — graceful mock mode
- **134 tests passing** (55 skip without Supabase, 1 todo) across 19 test files

### pos-shared (`packages/pos-shared`)
- Composite TypeScript library — Zod schemas shared between pos-api and pos-admin
- **Schemas**: auth, cash, common, menu, orders, receipts, receipts-history (new), reports, settings (new), staff (extended)
- `StaffResponseSchema` (with `active`, `has_pin`), `InviteStaffRequestSchema`, `UpdateStaffRequestSchema`
- `ReceiptHistoryEntrySchema`, `ReceiptHistoryResponseSchema`, `ListReceiptsQuerySchema`
- `TenantSettingsSchema`, `LocationSettingsSchema`, `SettingsResponseSchema`, `TimezoneSchema`

### POS Admin (`apps/pos-admin`) — Next.js admin portal (port 3001)
- Next.js 14 App Router, Auth.js v5, Tailwind v3, React Query v5, Radix UI
- Stack: session JWT (`posJwt`, `role`) stored in Auth.js session; server components prefetch → client React Query re-hydrates
- Session user has `role: "owner" | "manager"` and `posJwt: string`
- **Pages**: dashboard, menu, orders, cash, reports, **staff** (Batch 16), **receipts** (Batch 16), **settings** (Batch 16)
- **Staff page**: table with role/status badges, active toggle (with self-deactivate + last-owner guard), Invite/Edit dialog
- **Receipts page**: paginated email+SMS history, channel/status filters, click-to-copy provider ID, resend button
- **Settings page**: tenant section (owner edits, manager read-only), per-location section (both can edit), sales tax as % input

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

## Auth

- **POS Admin**: Auth.js v5 Credentials provider → hits `POST /v1/auth/sign-in` on pos-api → stores `posJwt` + `role` in session JWT
- **POS terminal**: terminal JWT signed by `signTerminalJwt` — kind="terminal", carries `location_id` + `staff_id`
- **Session JWT**: kind="session", carries `user_id` + `role` (owner|manager) — used by admin routes

## Important Constraints

- `@radix-ui/react-tabs` is NOT installed — use native `<button>` tabs or other Radix primitives
- No `date-fns` — use `Intl.DateTimeFormat` for all date formatting
- `sms_messages.status` has NO 'bounced' value (only queued/sent/failed) — email_messages has all 4
- `req.auth` in pos-api is a discriminated union — always narrow with `req.auth.kind === "session"` before accessing `user_id`
- pos-admin client API calls use `CLIENT_API = "/api/v1"` (relative, browser-side); server-side calls use `POS_API_URL` env var
