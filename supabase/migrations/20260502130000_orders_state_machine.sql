-- migration: 20260502130000_orders_state_machine
-- purpose: extend orders/order_items/payments with state-machine columns
--          for Batch 6 order lifecycle (open → fired → paid/voided)
--
-- DELTA from existing schema (0001-0008):
--   orders       → add voided_at, updated_at
--   order_items  → add voided_at; extend status check to include 'voided'
--   payments     → add updated_at; extend status check ('voided');
--                  extend method check ('card_mock')
--
-- DO NOT re-add columns/types that already exist (see 0001-0008).

-- ---------------------------------------------------------------------------
-- orders: add voided_at + updated_at
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists voided_at   timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- order_items: add voided_at + extend status check to allow 'voided'
-- ---------------------------------------------------------------------------
alter table order_items
  add column if not exists voided_at timestamptz;

-- Extend the status check constraint to include 'voided'
-- (the inline check constraint was auto-named order_items_status_check)
alter table order_items
  drop constraint if exists order_items_status_check;

alter table order_items
  add constraint order_items_status_check
    check (status in ('open', 'fired', 'bumped', 'voided'));

-- ---------------------------------------------------------------------------
-- payments: add updated_at + extend status + method check constraints
-- ---------------------------------------------------------------------------
alter table payments
  add column if not exists updated_at timestamptz not null default now();

-- Extend payment status to include 'voided'
alter table payments
  drop constraint if exists payments_status_check;

alter table payments
  add constraint payments_status_check
    check (status in (
      'requires_payment_method', 'processing', 'succeeded',
      'failed', 'canceled', 'voided'
    ));

-- Extend payment method to include 'card_mock' (used for mock pay flow)
alter table payments
  drop constraint if exists payments_method_check;

alter table payments
  add constraint payments_method_check
    check (method in (
      'card_present', 'card_not_present', 'cash', 'card_mock'
    ));

-- ---------------------------------------------------------------------------
-- No new service_role bypass needed — orders, order_items, payments already
-- received bypass policies in migration 0007 (rls_corrections).
-- ---------------------------------------------------------------------------
