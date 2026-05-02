-- migration: 20260502150000_cash_drawer_completion
-- purpose: delta from migration 20260502120400_cash_drawer
--
-- migration 20260502120400 created cash_drawer_sessions and cash_events but
-- omitted the `status` column on cash_drawer_sessions and the partial unique
-- index that enforces one open session per location at a time.
--
-- cash_events already has all five type values ('pay_in', 'pay_out', 'no_sale',
-- 'cash_sale', 'cash_refund'), expected_cents and variance_cents are already
-- present on the sessions table. Only the status column and uniqueness index
-- are missing.

alter table cash_drawer_sessions
  add column status text not null default 'open'
    check (status in ('open', 'closed'));

-- Enforce one open session per location at a time.
-- Closed sessions are not affected by this constraint.
create unique index cash_drawer_sessions_one_open_per_location
  on cash_drawer_sessions (location_id)
  where (status = 'open');
