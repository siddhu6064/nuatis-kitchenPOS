-- migration: 20260502140000_kds_bumped_status
-- purpose: KDS Batch 9 additions
--
-- DELTA from existing schema (migrations 0001-0009):
--   order_items.status already has 'bumped' (added in 0002, kept in 0009) ✓
--   order_items.bumped_at already exists (added in 0002) ✓
--
--   NEW: orders.order_number — sequential display number per location shown
--        on KDS ticket cards as "#42". Global sequence for this phase; a
--        per-location-per-day sequence can be added in a future migration.

-- ---------------------------------------------------------------------------
-- orders: add order_number using a global sequence
-- ---------------------------------------------------------------------------
create sequence if not exists orders_order_number_seq start 1 increment 1;

alter table orders
  add column if not exists order_number bigint
    default nextval('orders_order_number_seq');

-- Backfill any existing rows that were inserted before this migration
-- (development seed data). Safe to run on an empty table too.
update orders
  set order_number = nextval('orders_order_number_seq')
where order_number is null;

-- ---------------------------------------------------------------------------
-- Confirm order_items state — no structural changes needed
-- ---------------------------------------------------------------------------
-- order_items.status check already includes: open, fired, bumped, voided  (migration 0009)
-- order_items.bumped_at timestamptz column already exists                  (migration 0002)
-- No further changes required.
