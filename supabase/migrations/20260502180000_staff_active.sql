-- migration: 20260502180000_staff_active
-- purpose: add active boolean to staff_members for soft-delete pattern
--
-- Delta inspection:
--   staff_members (20260502120000): id, tenant_id, location_ids, full_name,
--     email, role, pin_hash, created_at
--   + password_hash (20260502120700)
--   MISSING: active boolean (needed for deactivate flow)

alter table staff_members
  add column active boolean not null default true;

comment on column staff_members.active is
  'Soft-delete flag. false = deactivated. Deactivated staff cannot sign in or use PINs.';

create index staff_members_tenant_active_idx
  on staff_members (tenant_id, active);
