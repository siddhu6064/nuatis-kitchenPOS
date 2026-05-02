-- migration: 20260502120400_cash_drawer
-- purpose: cash drawer sessions and individual cash events

-- cash_drawer_sessions
create table cash_drawer_sessions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  location_id           uuid not null references locations(id) on delete cascade,
  opened_by_staff_id    uuid not null references staff_members(id) on delete cascade,
  opening_float_cents   int not null,
  closing_actual_cents  int,
  expected_cents        int,
  variance_cents        int,
  opened_at             timestamptz not null default now(),
  closed_at             timestamptz
);

alter table cash_drawer_sessions enable row level security;

create policy tenant_isolation on cash_drawer_sessions
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index cash_drawer_sessions_tenant_id_idx on cash_drawer_sessions (tenant_id);

-- cash_events
create table cash_events (
  id          bigserial primary key,
  session_id  uuid not null references cash_drawer_sessions(id) on delete cascade,
  type        text not null check (type in (
    'pay_in', 'pay_out', 'no_sale', 'cash_sale', 'cash_refund'
  )),
  amount_cents int not null,
  reason      text,
  staff_id    uuid references staff_members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index cash_events_session_id_idx on cash_events (session_id);
