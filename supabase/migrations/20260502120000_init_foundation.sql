-- migration: 20260502120000_init_foundation
-- purpose: core tenant, location, staff, contacts, audit tables

-- tenants
create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  vertical   text not null,
  timezone   text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

alter table tenants enable row level security;

create policy tenant_isolation on tenants
  using (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index tenants_tenant_id_idx on tenants (id);

-- locations
create table locations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  name           text not null,
  address        jsonb,
  sales_tax_bps  int not null default 825,
  business_hours jsonb,
  created_at     timestamptz not null default now()
);

alter table locations enable row level security;

create policy tenant_isolation on locations
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index locations_tenant_id_idx on locations (tenant_id);

-- staff_members
create table staff_members (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  location_ids uuid[],
  full_name    text not null,
  email        text,
  role         text not null check (role in ('owner', 'manager', 'cashier')),
  pin_hash     text,
  created_at   timestamptz not null default now()
);

alter table staff_members enable row level security;

create policy tenant_isolation on staff_members
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index staff_members_tenant_id_idx on staff_members (tenant_id);

-- contacts
create table contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  full_name    text,
  phone        text,
  email        text,
  sms_opt_in   boolean not null default false,
  sms_opt_in_at timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table contacts enable row level security;

create policy tenant_isolation on contacts
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index contacts_tenant_id_idx on contacts (tenant_id);
create index contacts_tenant_phone_idx on contacts (tenant_id, phone);
create index contacts_tenant_email_idx on contacts (tenant_id, email);

-- audit_log
create table audit_log (
  id          bigserial primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  staff_id    uuid references staff_members(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  payload     jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy tenant_isolation on audit_log
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index audit_log_tenant_id_idx on audit_log (tenant_id);
