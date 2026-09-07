-- Eureach production-oriented core schema foundation.
-- Industry remains tenant configuration, never a vertical entity/table.

create table if not exists tenant (
  id uuid primary key,
  name text not null,
  industry_key text not null,
  configuration_version text not null default '1.0.0',
  created_at timestamptz not null default now()
);

create table if not exists app_role (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  unique (tenant_id, name)
);

create table if not exists app_user (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  role_id uuid references app_role(id),
  unique (tenant_id, id)
);

create table if not exists team (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null
);

create table if not exists territory (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null
);

create table if not exists campaign (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null check (status in ('draft','active','paused','completed'))
);

create table if not exists queue (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  campaign_id uuid references campaign(id) on delete set null
);

create table if not exists record (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  campaign_id uuid references campaign(id) on delete set null,
  territory_id uuid references territory(id) on delete set null,
  assigned_to uuid references app_user(id) on delete set null,
  status text not null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assignment (
  id uuid primary key,
  record_id uuid not null references record(id) on delete cascade,
  assignee_id uuid not null references app_user(id),
  queue_id uuid references queue(id) on delete set null,
  priority integer not null default 1,
  assigned_at timestamptz not null default now()
);

create table if not exists outreach_attempt (
  id uuid primary key,
  record_id uuid not null references record(id) on delete cascade,
  agent_id uuid not null references app_user(id),
  channel text not null check (channel in ('phone','sms','whatsapp','email','in_person','other')),
  attempted_at timestamptz not null default now(),
  notes text
);

create table if not exists outcome (
  id uuid primary key,
  record_id uuid not null references record(id) on delete cascade,
  attempt_id uuid not null references outreach_attempt(id) on delete cascade,
  type text not null,
  notes text,
  occurred_at timestamptz not null default now()
);

create table if not exists follow_up (
  id uuid primary key,
  record_id uuid not null references record(id) on delete cascade,
  owner_id uuid not null references app_user(id),
  due_at timestamptz not null,
  status text not null check (status in ('open','completed','cancelled'))
);

create table if not exists audit_event (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  actor_id uuid references app_user(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  occurred_at timestamptz not null default now()
);

create table if not exists notification (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  recipient_id uuid not null references app_user(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists analytics_event (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_record_tenant_status on record(tenant_id, status);
create index if not exists idx_record_campaign on record(tenant_id, campaign_id);
create index if not exists idx_assignment_record on assignment(record_id);
create index if not exists idx_assignment_queue on assignment(queue_id, priority);
create index if not exists idx_outreach_attempt_record on outreach_attempt(record_id, attempted_at desc);
create index if not exists idx_outcome_record on outcome(record_id, occurred_at desc);
create index if not exists idx_follow_up_owner_due on follow_up(owner_id, due_at) where status = 'open';
create index if not exists idx_audit_tenant_time on audit_event(tenant_id, occurred_at desc);
create index if not exists idx_analytics_tenant_time on analytics_event(tenant_id, occurred_at desc);
