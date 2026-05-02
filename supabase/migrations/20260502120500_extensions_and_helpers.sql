-- migration: 20260502120500_extensions_and_helpers
-- purpose: pgcrypto, uuid-ossp extensions and shared trigger helpers

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- trigger function: auto-update updated_at on row change
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- apply to contacts (the only table with updated_at in MVP scope)
create trigger contacts_set_updated_at
  before update on contacts
  for each row
  execute function set_updated_at();
