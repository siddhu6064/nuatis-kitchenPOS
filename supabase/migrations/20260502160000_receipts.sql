-- migration: 20260502160000_receipts
-- purpose: email/sms message tracking tables + TCPA evidence columns on contacts
--
-- Delta inspection:
--   Foundation migration (20260502120000) created contacts with:
--     sms_opt_in boolean, sms_opt_in_at timestamptz
--   MISSING: sms_opt_in_text text, sms_opt_in_ip inet (TCPA evidence)
--
--   email_messages and sms_messages tables do not yet exist.

-- ---------------------------------------------------------------------------
-- TCPA evidence columns on contacts
-- ---------------------------------------------------------------------------
alter table contacts
  add column sms_opt_in_text text,
  add column sms_opt_in_ip   inet;

-- ---------------------------------------------------------------------------
-- email_messages — outbound email log
-- ---------------------------------------------------------------------------
create table email_messages (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  order_id            uuid references orders(id) on delete set null,
  to_email            text not null,
  subject             text not null,
  status              text not null default 'queued'
                        check (status in ('queued', 'sent', 'failed', 'bounced')),
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

alter table email_messages enable row level security;

create policy tenant_isolation on email_messages
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index email_messages_tenant_created_idx
  on email_messages (tenant_id, created_at desc);
create index email_messages_order_id_idx
  on email_messages (order_id);

-- ---------------------------------------------------------------------------
-- sms_messages — outbound SMS log
-- ---------------------------------------------------------------------------
create table sms_messages (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  order_id            uuid references orders(id) on delete set null,
  to_phone            text not null,
  body                text not null,
  status              text not null default 'queued'
                        check (status in ('queued', 'sent', 'failed')),
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

alter table sms_messages enable row level security;

create policy tenant_isolation on sms_messages
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create index sms_messages_tenant_created_idx
  on sms_messages (tenant_id, created_at desc);
create index sms_messages_order_id_idx
  on sms_messages (order_id);
