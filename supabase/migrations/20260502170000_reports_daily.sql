-- migration: 20260502170000_reports_daily
-- purpose: end-of-day snapshot table + tenant daily-report email settings
--
-- Delta inspection:
--   tenants table (20260502120000): id, name, vertical, timezone, created_at
--   MISSING: email_daily_report, daily_report_recipient_email
--
--   reports_daily does not yet exist.

-- ---------------------------------------------------------------------------
-- reports_daily — immutable daily snapshot table
-- ---------------------------------------------------------------------------
create table reports_daily (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references tenants(id) on delete cascade,
  -- null = tenant-wide rollup; non-null = per-location (forward-compat only, not used in MVP)
  location_id                uuid references locations(id) on delete set null,
  date                       date not null,
  -- false = partial/in-progress snapshot; true = final end-of-day snapshot
  is_final                   boolean not null default true,
  snapshot_at                timestamptz not null default now(),
  gross_sales_cents          int not null default 0,
  taxable_cents              int not null default 0,
  tax_cents                  int not null default 0,
  tips_cents                 int not null default 0,
  discounts_cents            int not null default 0,
  voids_cents                int not null default 0,
  refunds_cents              int not null default 0,
  net_cents                  int not null default 0,
  order_count                int not null default 0,
  paid_order_count           int not null default 0,
  voided_order_count         int not null default 0,
  by_method                  jsonb not null default '[]',
  by_item                    jsonb not null default '[]',
  by_staff                   jsonb not null default '[]',
  -- refunds processed after the snapshot date — tracked here without rewriting history
  refunds_after_close_cents  int not null default 0,
  created_at                 timestamptz default now()
);

alter table reports_daily enable row level security;

create policy tenant_isolation on reports_daily
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy service_role_bypass on reports_daily
  using (auth.role() = 'service_role');

-- Partial unique indexes — PostgreSQL UNIQUE constraints treat NULL != NULL,
-- so we use two partial indexes to guarantee one row per (tenant, date):
--   • one for the tenant-wide rollup (location_id IS NULL)
--   • one for per-location rows (location_id IS NOT NULL)

create unique index reports_daily_tenant_date_null_idx
  on reports_daily (tenant_id, date) where location_id is null;

create unique index reports_daily_tenant_location_date_idx
  on reports_daily (tenant_id, location_id, date) where location_id is not null;

-- Descending date index for "list recent reports" queries
create index reports_daily_tenant_date_desc_idx
  on reports_daily (tenant_id, date desc);

-- ---------------------------------------------------------------------------
-- tenant settings: daily email report toggle
-- ---------------------------------------------------------------------------
alter table tenants
  add column email_daily_report          boolean not null default false,
  add column daily_report_recipient_email text;

comment on column tenants.email_daily_report is
  'When true, the end-of-day cron sends a daily summary email to the owner';
comment on column tenants.daily_report_recipient_email is
  'Override recipient for daily summary emails; falls back to owner staff_member.email when null';
