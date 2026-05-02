-- migration: 20260502120100_menu
-- purpose: menu categories, items, modifier groups and options

-- menu_categories
create table menu_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table menu_categories enable row level security;

create policy tenant_isolation on menu_categories
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index menu_categories_tenant_id_idx on menu_categories (tenant_id);

-- menu_items
create table menu_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  category_id      uuid not null references menu_categories(id) on delete cascade,
  name             text not null,
  price_cents      int not null,
  taxable          boolean not null default true,
  image_url        text,
  kitchen_station  text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table menu_items enable row level security;

create policy tenant_isolation on menu_items
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index menu_items_tenant_id_idx on menu_items (tenant_id);

-- modifier_groups
create table modifier_groups (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  min_select int not null default 0,
  max_select int not null default 1,
  required   boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table modifier_groups enable row level security;

create policy tenant_isolation on modifier_groups
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index modifier_groups_tenant_id_idx on modifier_groups (tenant_id);

-- modifier_options
create table modifier_options (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references modifier_groups(id) on delete cascade,
  name             text not null,
  price_delta_cents int not null default 0,
  sort_order       int not null default 0
);

create index modifier_options_group_id_idx on modifier_options (group_id);

-- menu_item_modifier_groups (junction)
create table menu_item_modifier_groups (
  item_id    uuid not null references menu_items(id) on delete cascade,
  group_id   uuid not null references modifier_groups(id) on delete cascade,
  sort_order int not null default 0,
  primary key (item_id, group_id)
);

create index menu_item_modifier_groups_item_id_idx on menu_item_modifier_groups (item_id);
create index menu_item_modifier_groups_group_id_idx on menu_item_modifier_groups (group_id);
