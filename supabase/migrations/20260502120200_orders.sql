-- migration: 20260502120200_orders
-- purpose: orders and order_items with realtime publication

-- orders
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  location_id         uuid not null references locations(id) on delete cascade,
  opened_by_staff_id  uuid not null references staff_members(id) on delete cascade,
  contact_id          uuid references contacts(id) on delete set null,
  status              text not null check (status in ('open', 'fired', 'paid', 'voided')),
  vertical            text not null,
  subtotal_cents      int not null default 0,
  tax_cents           int not null default 0,
  tip_cents           int not null default 0,
  total_cents         int not null default 0,
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz
);

alter table orders enable row level security;

create policy tenant_isolation on orders
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index orders_tenant_id_idx on orders (tenant_id);

-- order_items
create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  menu_item_id      uuid references menu_items(id) on delete set null,
  name_snapshot     text not null,
  qty               int not null default 1,
  price_cents       int not null,
  modifiers_json    jsonb,
  course            int not null default 1,
  kitchen_station   text,
  status            text not null check (status in ('open', 'fired', 'bumped')),
  provider_staff_id uuid references staff_members(id) on delete set null,
  fired_at          timestamptz,
  bumped_at         timestamptz
);

alter table order_items enable row level security;

create policy tenant_isolation on order_items
  using (
    (select tenant_id from orders where orders.id = order_items.order_id)
    = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

create index order_items_order_id_idx on order_items (order_id);

-- enable realtime for KDS subscriptions
alter publication supabase_realtime add table orders, order_items;
