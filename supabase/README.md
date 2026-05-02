# Nuatis POS — Supabase Schema

Versioned schema-as-code for the Nuatis POS production database.
This folder contains all SQL migrations, seed data, and Supabase CLI config.
No code in `artifacts/` references these tables — that wiring happens in Phase 0 Batch 2+.

---

## Folder Structure

```
supabase/
├── config.toml           # Supabase CLI project config (local dev)
├── seed.sql              # Demo tenant, location, staff, menu for local dev
├── README.md             # This file
└── migrations/
    ├── 20260502120000_init_foundation.sql   # tenants, locations, staff, contacts, audit_log
    ├── 20260502120100_menu.sql              # menu_categories, menu_items, modifier_groups/options
    ├── 20260502120200_orders.sql            # orders, order_items (+ realtime publication)
    ├── 20260502120300_payments.sql          # payments, refunds, terminals
    ├── 20260502120400_cash_drawer.sql       # cash_drawer_sessions, cash_events
    └── 20260502120500_extensions_and_helpers.sql  # pgcrypto, uuid-ossp, set_updated_at trigger
```

---

## Installing the Supabase CLI

**macOS (Homebrew):**
```bash
brew install supabase/tap/supabase
```

**npm / pnpm (cross-platform):**
```bash
npm i -g supabase
# or
pnpm add -g supabase
```

Verify: `supabase --version`

---

## Linking to a Supabase Project

> ⚠️ No Supabase project has been created yet (as of May 2026).
> Create one at https://supabase.com/dashboard, then run:

```bash
cd supabase
supabase link --project-ref <your-project-ref>
```

The project ref is the string in your Supabase dashboard URL:
`https://supabase.com/dashboard/project/<ref>`

---

## Pushing Migrations to Remote

```bash
pnpm run db:push
# or directly:
cd supabase && supabase db push
```

This applies all unapplied migrations from `migrations/` to the linked project.

---

## Resetting Local Dev DB

```bash
pnpm run db:reset
# or directly:
cd supabase && supabase db reset
```

Drops and recreates the local Postgres DB, re-runs all migrations in order, then runs `seed.sql`.
Requires `supabase start` to be running first.

---

## Adding a New Migration

```bash
pnpm run db:migrate:new -- <migration_name>
# e.g.:
pnpm run db:migrate:new -- add_loyalty_points
```

This creates a new timestamped file in `migrations/`. Edit it, review, then push.
Never edit an already-applied migration — always add a new one.

---

## Decision History

| Decision | Choice | Rationale |
|---|---|---|
| Database | Supabase (new account) | Separate from Suite Supabase; cross-sync via API webhooks at integration time |
| Table prefix | None (no `pos_` prefix) | Schema is standalone — no namespace collision risk |
| Multi-tenancy | `tenant_id` on every table + RLS | Day-one isolation; no rework when onboarding real merchants |
| Money storage | `int` named `*_cents` | No float drift; cents are exact |
| IDs | `uuid` with `gen_random_uuid()` | Distributed-safe, no sequential guessing |
| RLS policy pattern | `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` | tenant_id injected by backend into JWT app_metadata at sign-in |
| Realtime | `orders` + `order_items` tables published | KDS subscription support without extra config |
| Post-MVP tables | Not created | memberships, gift cards, packages, floor plans, printers, tips ledger all deferred |
