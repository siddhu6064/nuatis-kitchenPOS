-- migration: 20260502120300_payments
-- purpose: payments, refunds, stripe terminal readers

-- payments
create table payments (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  order_id                 uuid not null references orders(id) on delete cascade,
  stripe_payment_intent_id text unique,
  amount_cents             int not null,
  tip_cents                int not null default 0,
  application_fee_cents    int not null default 0,
  status                   text not null check (status in (
    'requires_payment_method', 'processing', 'succeeded', 'failed', 'canceled'
  )),
  method                   text not null check (method in (
    'card_present', 'card_not_present', 'cash'
  )),
  card_last4               text,
  card_brand               text,
  created_at               timestamptz not null default now()
);

alter table payments enable row level security;

create policy tenant_isolation on payments
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index payments_tenant_id_idx on payments (tenant_id);

-- refunds
create table refunds (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid not null references payments(id) on delete cascade,
  stripe_refund_id      text unique,
  amount_cents          int not null,
  reason                text,
  refunded_by_staff_id  uuid references staff_members(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index refunds_payment_id_idx on refunds (payment_id);

-- terminals (stripe reader registration)
create table terminals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete cascade,
  stripe_reader_id  text unique not null,
  label             text,
  last_seen_at      timestamptz,
  registered_at     timestamptz not null default now()
);

alter table terminals enable row level security;

create policy tenant_isolation on terminals
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index terminals_tenant_id_idx on terminals (tenant_id);
