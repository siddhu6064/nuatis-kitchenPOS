-- migration: 20260502190000_stripe_connect
-- purpose: Stripe Connect Standard + Terminal payment columns
--
-- Delta inspection:
--   tenants (20260502120000): id, name, vertical, timezone, created_at
--   tenants (20260502170000): + email_daily_report, daily_report_recipient_email
--   MISSING: stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled,
--            stripe_requirements_currently_due, application_fee_bps
--
--   payments (20260502120300): id, tenant_id, order_id, stripe_payment_intent_id,
--            amount_cents, tip_cents, application_fee_cents, status, method,
--            card_last4, card_brand
--   payments (20260502130000): + updated_at; method check extended with card_mock
--   MISSING: stripe_charge_id, card_stripe method
--
--   refunds (20260502120300): id, payment_id, stripe_refund_id (nullable),
--            amount_cents, reason, refunded_by_staff_id, created_at
--   MISSING: application_fee_refund_cents

-- ---------------------------------------------------------------------------
-- tenants — Stripe Connect fields
-- ---------------------------------------------------------------------------
alter table tenants
  add column stripe_account_id                text,
  add column stripe_charges_enabled           boolean not null default false,
  add column stripe_payouts_enabled           boolean not null default false,
  add column stripe_requirements_currently_due jsonb,
  add column application_fee_bps              int not null default 0;

comment on column tenants.stripe_account_id is
  'Stripe Connect Standard account ID (acct_...). NULL until owner completes onboarding.';
comment on column tenants.application_fee_bps is
  'Platform application fee in basis points (100 bps = 1%). 0 for MVP.';

create unique index tenants_stripe_account_id_idx
  on tenants (stripe_account_id)
  where stripe_account_id is not null;

-- ---------------------------------------------------------------------------
-- payments — Stripe charge ID + card_stripe method
-- ---------------------------------------------------------------------------
alter table payments
  add column stripe_charge_id text;

-- Extend method check to include card_stripe
alter table payments
  drop constraint if exists payments_method_check;

alter table payments
  add constraint payments_method_check
    check (method in (
      'card_present', 'card_not_present', 'cash', 'card_mock', 'card_stripe'
    ));

-- ---------------------------------------------------------------------------
-- refunds — application_fee_refund_cents
-- ---------------------------------------------------------------------------
alter table refunds
  add column application_fee_refund_cents int not null default 0;

comment on column refunds.application_fee_refund_cents is
  'Stripe application fee reversed with this refund (cents). 0 for non-Stripe refunds.';
