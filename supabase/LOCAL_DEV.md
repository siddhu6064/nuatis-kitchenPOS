# Supabase Local Development

This directory contains the Supabase project config, migrations, and seed data for the Nuatis POS prototype.

## How `supabase start` works

The Supabase CLI uses Docker to spin up a full local Supabase stack that mirrors the cloud service:

| Service | Port | Purpose |
|---------|------|---------|
| PostgREST API | 54321 | REST + GraphQL over Postgres |
| Postgres | 54322 | Direct database access |
| Studio | 54323 | Web UI to browse tables, run SQL |
| Inbucket | 54324 | Catches all outgoing email (dev only) |

First run pulls Docker images — typically 1–3 minutes. Subsequent starts are < 10 seconds.

## Start / stop

```bash
# Start (from repo root)
npx supabase start

# Stop and keep data
npx supabase stop

# Stop and delete all data (clean slate)
npx supabase stop --no-backup
```

## Apply all migrations + seed from scratch

```bash
npx supabase db reset
```

This drops the local database, re-runs all migrations in `migrations/` in filename order (`0001` → `0009`), and then executes `seed.sql`. Use this any time you want a clean, fully-seeded database.

## Apply a new migration without resetting

```bash
npx supabase db push
```

Runs only migrations that haven't been applied yet. Preserves existing data.

## Check for schema drift

```bash
npx supabase db diff
```

Shows differences between the local database state and the current migration files. Should be empty on a clean checkout after `supabase db reset`.

## Inspect tables in Studio

Open [http://localhost:54323](http://localhost:54323) in your browser while `supabase start` is running.

Useful tables:
- `tenants` — top-level merchant accounts
- `locations` — physical stores (1 per tenant in seed)
- `staff_members` — cashiers and owners with hashed PINs
- `menu_categories` / `menu_items` — the cafe menu (12 items seeded)
- `orders` / `order_items` — POS orders and their line items
- `payments` — payment records (method: `card_mock` in prototype)
- `audit_log` — sign-in events and other security-relevant actions

## Run SQL directly

```bash
# Via Supabase CLI
npx supabase db psql

# Via psql (if installed)
psql postgresql://postgres:postgres@localhost:54322/postgres
```

Useful queries:

```sql
-- Check seeded data
select count(*) from menu_items;        -- → 12
select count(*) from staff_members;     -- → 1
select id, name from tenants;
select id, name from locations;

-- Inspect latest orders
select id, status, created_at from orders order by created_at desc limit 5;

-- Inspect latest payments
select id, status, amount_cents, tip_cents from payments order by created_at desc limit 5;

-- Audit trail
select action, created_at, ip_address from audit_log order by created_at desc limit 10;
```

## Migration history

| File | Description |
|------|-------------|
| `20260502120000_init_foundation.sql` | Core tables: tenants, locations, staff_members, audit_log |
| `20260502120100_menu.sql` | Menu categories, items, modifiers |
| `20260502120200_orders.sql` | Orders and order_items |
| `20260502120300_payments.sql` | Payments table |
| `20260502120400_cash_drawer.sql` | Cash drawer events |
| `20260502120500_rls_policies.sql` | Row-level security policies |
| `20260502120600_kitchen_broadcast.sql` | Realtime kitchen broadcast trigger |
| `20260502120700_indexes.sql` | Performance indexes |
| `20260502120800_audit_triggers.sql` | Automated audit log triggers |

Migrations `0001–0009` are **immutable**. Never edit them after they have been applied to any environment. Add new `0010_*.sql` files for schema changes.

## Seeded demo data

All seed data is in `seed.sql`. See that file for UUIDs and credentials.

| Entity | ID | Details |
|--------|----|---------|
| Tenant | `00000000-…-0001` | Demo Cafe |
| Location | `00000000-…-0010` | Main Street, Austin TX |
| Staff (owner) | `00000000-…-0020` | Siddhu Demo — PIN `1234`, email `owner@democafe.test` |
| Menu categories | `…0030`, `…0031` | Drinks (6 items), Food (6 items) |
| Menu items | `…0040–0051` | Espresso $3, Latte $4.50, … Salad $11 |
