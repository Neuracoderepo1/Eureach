-- Eureach core schema. PostgreSQL 15+.
create extension if not exists pgcrypto;

create table if not exists tenant (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  industry_key text not null,
  configuration_version text not null default '1.0.0',
  created_at timestamptz not null default now()
);
create table if not exists app_role (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  unique(tenant_id,name), unique(tenant_id,id)
);
create table if not exists app_user (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text not null,
  role_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,role_id) references app_role(tenant_id,id)
);
create table if not exists team (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  unique(tenant_id,id)
);
create table if not exists territory (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  unique(tenant_id,id)
);
create table if not exists campaign (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null check(status in ('draft','active','paused','completed')),
  created_at timestamptz not null default now(),
  unique(tenant_id,id)
);
create table if not exists queue (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  campaign_id uuid,
  created_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,campaign_id) references campaign(tenant_id,id) on delete set null
);
create table if not exists record (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  campaign_id uuid,
  territory_id uuid,
  assigned_to uuid,
  status text not null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,campaign_id) references campaign(tenant_id,id) on delete set null,
  foreign key(tenant_id,territory_id) references territory(tenant_id,id) on delete set null,
  foreign key(tenant_id,assigned_to) references app_user(tenant_id,id) on delete set null
);
create table if not exists assignment (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  record_id uuid not null,
  assignee_id uuid not null,
  queue_id uuid,
  priority integer not null default 1,
  assigned_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,record_id) references record(tenant_id,id) on delete cascade,
  foreign key(tenant_id,assignee_id) references app_user(tenant_id,id),
  foreign key(tenant_id,queue_id) references queue(tenant_id,id) on delete set null
);
create table if not exists outreach_attempt (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  record_id uuid not null,
  agent_id uuid not null,
  channel text not null check(channel in('phone','sms','whatsapp','email','in_person','other')),
  attempted_at timestamptz not null default now(),
  notes text,
  unique(tenant_id,id),
  foreign key(tenant_id,record_id) references record(tenant_id,id) on delete cascade,
  foreign key(tenant_id,agent_id) references app_user(tenant_id,id)
);
create table if not exists outcome (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  record_id uuid not null,
  attempt_id uuid not null,
  type text not null,
  notes text,
  occurred_at timestamptz not null default now(),
  unique(tenant_id,id),
  foreign key(tenant_id,record_id) references record(tenant_id,id) on delete cascade,
  foreign key(tenant_id,attempt_id) references outreach_attempt(tenant_id,id) on delete cascade
);
create table if not exists follow_up (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  record_id uuid not null,
  owner_id uuid not null,
  due_at timestamptz not null,
  status text not null check(status in('open','completed','cancelled')),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,record_id) references record(tenant_id,id) on delete cascade,
  foreign key(tenant_id,owner_id) references app_user(tenant_id,id)
);
create table if not exists audit_event (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key(tenant_id,actor_id) references app_user(tenant_id,id)
);
create table if not exists notification (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  recipient_id uuid not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,recipient_id) references app_user(tenant_id,id) on delete cascade
);
create table if not exists analytics_event (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create table if not exists refresh_token (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  user_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,user_id) references app_user(tenant_id,id) on delete cascade
);

create unique index if not exists uq_user_tenant_email on app_user(tenant_id, lower(email));
-- Login/refresh need a controlled cross-tenant lookup. SECURITY DEFINER functions expose only the minimum fields.
create or replace function eureach_auth_user(p_slug text, p_email text)
returns table(user_id uuid, tenant_id uuid, name text, email text, password_hash text, is_active boolean, role_name text, permissions jsonb, tenant_name text, industry_key text, configuration_version text)
language sql security definer set search_path = public as $$
  select u.id,u.tenant_id,u.name,u.email,u.password_hash,u.is_active,r.name,r.permissions,t.name,t.industry_key,t.configuration_version
  from app_user u join tenant t on t.id=u.tenant_id join app_role r on r.id=u.role_id and r.tenant_id=u.tenant_id
  where t.slug=p_slug and lower(u.email)=lower(p_email)
$$;
create or replace function eureach_refresh_user(p_token_hash text)
returns table(token_id uuid, tenant_id uuid, user_id uuid, name text, email text, role_name text, permissions jsonb, tenant_name text, industry_key text, configuration_version text)
language sql security definer set search_path = public as $$
  select rt.id,rt.tenant_id,rt.user_id,u.name,u.email,r.name,r.permissions,t.name,t.industry_key,t.configuration_version
  from refresh_token rt join app_user u on u.id=rt.user_id join app_role r on r.id=u.role_id and r.tenant_id=u.tenant_id join tenant t on t.id=u.tenant_id
  where rt.token_hash=p_token_hash and rt.revoked_at is null and rt.expires_at>now() and u.is_active
$$;

create or replace function eureach_create_refresh_token(p_id uuid,p_tenant_id uuid,p_user_id uuid,p_token_hash text,p_days integer)
returns void language sql security definer set search_path=public as $$
  insert into refresh_token(id,tenant_id,user_id,token_hash,expires_at) values(p_id,p_tenant_id,p_user_id,p_token_hash,now()+make_interval(days=>p_days));
$$;
create or replace function eureach_revoke_refresh_token_by_hash(p_token_hash text) returns void language sql security definer set search_path=public as $$ update refresh_token set revoked_at=now() where token_hash=p_token_hash and revoked_at is null; $$;
create or replace function eureach_revoke_refresh_token(p_id uuid)
returns void language sql security definer set search_path=public as $$
  update refresh_token set revoked_at=now() where id=p_id;
$$;

create index if not exists idx_record_tenant_status on record(tenant_id,status);
create index if not exists idx_record_campaign on record(tenant_id,campaign_id);
create index if not exists idx_record_custom_fields on record using gin(custom_fields);
create index if not exists idx_assignment_queue on assignment(tenant_id,queue_id,priority);
create index if not exists idx_outreach_record on outreach_attempt(tenant_id,record_id,attempted_at desc);
create index if not exists idx_outcome_record on outcome(tenant_id,record_id,occurred_at desc);
create index if not exists idx_followup_due on follow_up(tenant_id,owner_id,due_at) where status='open';
create index if not exists idx_audit_tenant_time on audit_event(tenant_id,occurred_at desc);
create index if not exists idx_analytics_tenant_time on analytics_event(tenant_id,occurred_at desc);
create index if not exists idx_refresh_user on refresh_token(tenant_id,user_id,expires_at desc);

-- Tenant isolation is enforced in the database, not only by application code.
do $$ declare t text; begin foreach t in array array['tenant','app_role','app_user','team','territory','campaign','queue','record','assignment','outreach_attempt','outcome','follow_up','audit_event','notification','analytics_event','refresh_token'] loop execute format('alter table %I enable row level security',t); execute format('alter table %I force row level security',t); execute format('drop policy if exists tenant_isolation on %I',t); execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t); end loop; end $$;


-- The application role should never own tables. Set DATABASE_URL to this role.
-- Provisioning is performed by the container entrypoint or DBA.
