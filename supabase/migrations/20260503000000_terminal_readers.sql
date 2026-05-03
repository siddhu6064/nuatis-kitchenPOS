-- migration: 20260503000000_terminal_readers
-- purpose: Create stripe_terminal_readers table for device registration

create table stripe_terminal_readers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  stripe_reader_id text not null,
  label            text not null,
  location_id      uuid references locations(id) on delete set null,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now()
);

create unique index stripe_terminal_readers_stripe_reader_id_idx
  on stripe_terminal_readers(stripe_reader_id);

create index stripe_terminal_readers_tenant_id_idx
  on stripe_terminal_readers(tenant_id);

comment on table stripe_terminal_readers is
  'Stripe Terminal readers registered to a tenant location.';
comment on column stripe_terminal_readers.stripe_reader_id is
  'Stripe-assigned reader ID (tmr_...). Unique across tenants.';
comment on column stripe_terminal_readers.last_seen_at is
  'Set to NOW() when registered; updated by Terminal SDK heartbeats.';
