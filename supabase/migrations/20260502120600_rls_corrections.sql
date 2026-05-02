-- migration: 20260502120600_rls_corrections
-- purpose: three corrections to the initial RLS design (batch 1–6)
--
--   A. service_role bypass policies on all 17 RLS-enabled tables
--      (so backend workers can read/write across tenants without JWT claims)
--
--   B. denormalize tenant_id onto order_items
--      (Realtime filtering and direct query performance; avoids subquery in RLS)
--
--   C. add tenant_id + full RLS to refunds
--      (was omitted in 20260502120300_payments — no tenant_id, no RLS)
--
-- NOTE: migrations 0001–0006 are immutable; all corrections go in this file.
-- NOTE: modifier_options, menu_item_modifier_groups, cash_events had no RLS
--       in batch 1 (no tenant_id on those tables). RLS is enabled here with
--       service_role_bypass only. Authenticated clients access these tables
--       via RPC or through service_role; a future migration can add a
--       read_authenticated policy if direct client reads are needed.


-- ==========================================================================
-- SECTION A  service_role bypass on all 17 RLS-enabled tables
-- ==========================================================================

-- ---- tables that already had RLS from batch 1 ----------------------------

create policy service_role_bypass on tenants
  for all to service_role using (true) with check (true);

create policy service_role_bypass on locations
  for all to service_role using (true) with check (true);

create policy service_role_bypass on staff_members
  for all to service_role using (true) with check (true);

create policy service_role_bypass on contacts
  for all to service_role using (true) with check (true);

create policy service_role_bypass on audit_log
  for all to service_role using (true) with check (true);

create policy service_role_bypass on menu_categories
  for all to service_role using (true) with check (true);

create policy service_role_bypass on menu_items
  for all to service_role using (true) with check (true);

create policy service_role_bypass on modifier_groups
  for all to service_role using (true) with check (true);

create policy service_role_bypass on orders
  for all to service_role using (true) with check (true);

create policy service_role_bypass on order_items
  for all to service_role using (true) with check (true);

create policy service_role_bypass on payments
  for all to service_role using (true) with check (true);

create policy service_role_bypass on terminals
  for all to service_role using (true) with check (true);

create policy service_role_bypass on cash_drawer_sessions
  for all to service_role using (true) with check (true);

-- ---- tables that had NO RLS in batch 1 (enable first, then bypass) -------
-- modifier_options, menu_item_modifier_groups, cash_events have no tenant_id;
-- only service_role bypass is added. Anon/authenticated access goes via RPC.

alter table modifier_options enable row level security;
create policy service_role_bypass on modifier_options
  for all to service_role using (true) with check (true);

alter table menu_item_modifier_groups enable row level security;
create policy service_role_bypass on menu_item_modifier_groups
  for all to service_role using (true) with check (true);

alter table cash_events enable row level security;
create policy service_role_bypass on cash_events
  for all to service_role using (true) with check (true);


-- ==========================================================================
-- SECTION B  denormalize tenant_id onto order_items
-- ==========================================================================
-- Rationale: the original tenant_isolation policy used a subquery on orders.
-- This is both slower on large tables and incompatible with Supabase Realtime
-- row filtering (which only evaluates the top-level row's columns).

alter table order_items
  add column tenant_id uuid not null references tenants(id) on delete cascade;

create index order_items_tenant_id_idx on order_items (tenant_id);

-- drop the subquery-based policy and replace with a direct column check
drop policy tenant_isolation on order_items;

create policy tenant_isolation on order_items
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ==========================================================================
-- SECTION C  add tenant_id + full RLS to refunds
-- ==========================================================================
-- Rationale: refunds was omitted from RLS in 20260502120300_payments.
-- Adding tenant_id directly (same pattern as all other child tables).
-- No backfill needed — refunds is empty in seed data.

alter table refunds
  add column tenant_id uuid not null references tenants(id) on delete cascade;

create index refunds_tenant_id_idx on refunds (tenant_id);

alter table refunds enable row level security;

create policy tenant_isolation on refunds
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy service_role_bypass on refunds
  for all to service_role using (true) with check (true);


-- ==========================================================================
-- SECTION D  verification queries (documentation only — do not execute)
-- ==========================================================================
--
-- 1. Count policies per RLS-enabled table (expect 2 for all tables except
--    modifier_options, menu_item_modifier_groups, cash_events which have 1):
--
--    select tablename, count(*) as policy_count
--    from pg_policies
--    where schemaname = 'public'
--    group by tablename
--    order by tablename;
--
-- 2. Confirm service_role can read all rows across tenants (run as service_role):
--
--    set role service_role;
--    select count(*) from tenants;   -- should return all rows, not 0
--    reset role;
--
-- 3. Confirm anon role is blocked without JWT (expect 0 rows or permission error):
--
--    set role anon;
--    select count(*) from tenants;   -- should return 0 (RLS blocks)
--    reset role;
--
-- 4. Full policy audit across all corrected tables:
--
--    select tablename, policyname, roles, cmd
--    from pg_policies
--    where schemaname = 'public'
--      and tablename in (
--        'tenants','locations','staff_members','contacts','audit_log',
--        'menu_categories','menu_items','modifier_groups',
--        'modifier_options','menu_item_modifier_groups',
--        'orders','order_items','payments','refunds',
--        'terminals','cash_drawer_sessions','cash_events'
--      )
--    order by tablename, policyname;
