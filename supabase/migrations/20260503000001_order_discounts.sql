-- migration: 20260503000001_order_discounts
-- purpose: per-order ad-hoc discount engine
--   - taxable snapshot on order_items (to compute proportional tax reduction)
--   - discount_total_cents denorm on orders (for read speed)
--   - order_discounts table with soft-delete void pattern

-- ---------------------------------------------------------------------------
-- 1. Snapshot taxable flag on order_items (mirrors menu_items.taxable default)
-- ---------------------------------------------------------------------------
alter table order_items
  add column taxable boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Denormalized discount total on orders
-- ---------------------------------------------------------------------------
alter table orders
  add column discount_total_cents int not null default 0;

-- ---------------------------------------------------------------------------
-- 3. order_discounts
-- ---------------------------------------------------------------------------
create table order_discounts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  order_id             uuid not null references orders(id) on delete cascade,
  type                 text not null check (type in ('pct', 'amt')),
  value_bps            int,       -- set when type='pct'; 1000 = 10%
  value_cents          int,       -- set when type='amt'
  applied_amount_cents int not null default 0,
  applied_by_staff_id  uuid not null references staff_members(id),
  reason               text not null,
  applied_at           timestamptz not null default now(),
  voided_at            timestamptz,
  voided_by_staff_id   uuid references staff_members(id)
);

alter table order_discounts enable row level security;

create policy tenant_isolation on order_discounts
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Partial index: fast lookup of active (non-voided) discounts per order
create index order_discounts_order_active_idx
  on order_discounts (order_id, applied_at)
  where voided_at is null;

-- Full index for order_id (to fetch all including voided for audit)
create index order_discounts_order_id_idx
  on order_discounts (order_id);

-- tenant_id index for RLS performance
create index order_discounts_tenant_id_idx
  on order_discounts (tenant_id);
