-- migration: 20260502120700_staff_password_hash
-- purpose: add password_hash column to staff_members for owner/manager email+password sign-in
--
-- Owner/manager password hash (bcrypt cost 12).
-- Null for cashier-only accounts (they sign in via pin_hash).

alter table staff_members
  add column password_hash text;

comment on column staff_members.password_hash is
  'bcrypt cost-12 hash of the staff member password. Null for cashiers who use pin_hash only.';
