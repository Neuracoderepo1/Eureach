-- Production hardening migration. PostgreSQL 15+ recommended.
create extension if not exists pgcrypto;

alter table tenant add column if not exists slug text;
update tenant set slug = coalesce(slug, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text,1,8));
alter table tenant alter column slug set not null;
create unique index if not exists uq_tenant_slug on tenant(slug);

alter table app_role add column if not exists permissions jsonb not null default '[]'::jsonb;
alter table app_user add column if not exists email text;
alter table app_user add column if not exists password_hash text;
alter table app_user add column if not exists is_active boolean not null default true;
alter table app_user add column if not exists created_at timestamptz not null default now();
update app_user set email = coalesce(email, 'legacy-' || id::text || '@invalid.local');
update app_user set password_hash = coalesce(password_hash, '!disabled!');
alter table app_user alter column email set not null;
alter table app_user alter column password_hash set not null;
create unique index if not exists uq_user_tenant_email on app_user(tenant_id, lower(email));

alter table audit_event add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table notification add column if not exists read_at timestamptz;

create table if not exists refresh_token (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_refresh_user on refresh_token(user_id, expires_at desc);

-- Composite keys prevent cross-tenant object references even if an application bug occurs.
create unique index if not exists uq_role_tenant_id on app_role(tenant_id,id);
alter table app_user drop constraint if exists app_user_tenant_id_id_key;
create unique index if not exists uq_user_tenant_id on app_user(tenant_id,id);
alter table campaign add constraint uq_campaign_tenant_id unique(tenant_id,id);
alter table queue add constraint uq_queue_tenant_id unique(tenant_id,id);
alter table territory add constraint uq_territory_tenant_id unique(tenant_id,id);
alter table record add constraint uq_record_tenant_id unique(tenant_id,id);

-- Replace single-column relationships with tenant-scoped composite relationships.
alter table app_user drop constraint if exists app_user_role_id_fkey;
alter table app_user add constraint fk_user_role_tenant foreign key(tenant_id,role_id) references app_role(tenant_id,id);
alter table queue drop constraint if exists queue_campaign_id_fkey;
alter table queue add constraint fk_queue_campaign_tenant foreign key(tenant_id,campaign_id) references campaign(tenant_id,id);
alter table record drop constraint if exists record_campaign_id_fkey;
alter table record add constraint fk_record_campaign_tenant foreign key(tenant_id,campaign_id) references campaign(tenant_id,id);
alter table record drop constraint if exists record_territory_id_fkey;
alter table record add constraint fk_record_territory_tenant foreign key(tenant_id,territory_id) references territory(tenant_id,id);
alter table record drop constraint if exists record_assigned_to_fkey;
alter table record add constraint fk_record_assignee_tenant foreign key(tenant_id,assigned_to) references app_user(tenant_id,id);
alter table assignment add column if not exists tenant_id uuid;
update assignment a set tenant_id=r.tenant_id from record r where a.record_id=r.id and a.tenant_id is null;
alter table assignment alter column tenant_id set not null;
create unique index if not exists uq_assignment_tenant_id on assignment(tenant_id,id);
alter table assignment drop constraint if exists assignment_assignee_id_fkey;
alter table assignment add constraint fk_assignment_assignee_tenant foreign key(tenant_id,assignee_id) references app_user(tenant_id,id);
alter table assignment drop constraint if exists assignment_queue_id_fkey;
alter table assignment add constraint fk_assignment_queue_tenant foreign key(tenant_id,queue_id) references queue(tenant_id,id);
alter table outreach_attempt add column if not exists tenant_id uuid;
update outreach_attempt a set tenant_id=r.tenant_id from record r where a.record_id=r.id and a.tenant_id is null;
alter table outreach_attempt alter column tenant_id set not null;
create unique index if not exists uq_attempt_tenant_id on outreach_attempt(tenant_id,id);
alter table outreach_attempt drop constraint if exists outreach_attempt_agent_id_fkey;
alter table outreach_attempt add constraint fk_attempt_agent_tenant foreign key(tenant_id,agent_id) references app_user(tenant_id,id);
alter table outcome add column if not exists tenant_id uuid;
update outcome o set tenant_id=r.tenant_id from record r where o.record_id=r.id and o.tenant_id is null;
alter table outcome alter column tenant_id set not null;
create unique index if not exists uq_outcome_tenant_id on outcome(tenant_id,id);
alter table follow_up add column if not exists tenant_id uuid;
update follow_up f set tenant_id=r.tenant_id from record r where f.record_id=r.id and f.tenant_id is null;
alter table follow_up alter column tenant_id set not null;
create unique index if not exists uq_followup_tenant_id on follow_up(tenant_id,id);
alter table follow_up drop constraint if exists follow_up_owner_id_fkey;
alter table follow_up add constraint fk_followup_owner_tenant foreign key(tenant_id,owner_id) references app_user(tenant_id,id);

-- RLS: every tenant-owned table is invisible outside the transaction tenant context.
-- The tenant table has no tenant_id column -- its own id is the tenant
-- boundary -- so it gets its own policy comparing id, same as in
-- 001_core_schema.sql. The generic loop below only covers tables that
-- actually have a tenant_id foreign key.
alter table tenant enable row level security;
alter table tenant force row level security;
drop policy if exists tenant_isolation on tenant;
create policy tenant_isolation on tenant using (id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

do $$ declare t text; begin
  foreach t in array array['app_role','app_user','team','territory','campaign','queue','record','assignment','outreach_attempt','outcome','follow_up','audit_event','notification','analytics_event','refresh_token'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  end loop;
end $$;

-- Prevent direct application sessions from bypassing RLS by role switching.
revoke all on all tables in schema public from public;

alter table audit_event drop constraint if exists audit_event_actor_id_fkey;
alter table audit_event add constraint fk_audit_actor_tenant foreign key(tenant_id,actor_id) references app_user(tenant_id,id);
alter table notification drop constraint if exists notification_recipient_id_fkey;
alter table notification add constraint fk_notification_recipient_tenant foreign key(tenant_id,recipient_id) references app_user(tenant_id,id) on delete cascade;
alter table refresh_token drop constraint if exists refresh_token_user_id_fkey;
alter table refresh_token add constraint fk_refresh_user_tenant foreign key(tenant_id,user_id) references app_user(tenant_id,id) on delete cascade;

create or replace function eureach_auth_user(p_slug text, p_email text)
returns table(user_id uuid, tenant_id uuid, name text, email text, password_hash text, is_active boolean, role_name text, permissions jsonb, tenant_name text, industry_key text, configuration_version text)
language sql security definer set search_path=public as $$
  select u.id,u.tenant_id,u.name,u.email,u.password_hash,u.is_active,r.name,r.permissions,t.name,t.industry_key,t.configuration_version
  from app_user u join tenant t on t.id=u.tenant_id join app_role r on r.id=u.role_id and r.tenant_id=u.tenant_id
  where t.slug=p_slug and lower(u.email)=lower(p_email)
$$;
create or replace function eureach_refresh_user(p_token_hash text)
returns table(token_id uuid, tenant_id uuid, user_id uuid, name text, email text, role_name text, permissions jsonb, tenant_name text, industry_key text, configuration_version text)
language sql security definer set search_path=public as $$
  select rt.id,rt.tenant_id,rt.user_id,u.name,u.email,r.name,r.permissions,t.name,t.industry_key,t.configuration_version
  from refresh_token rt join app_user u on u.id=rt.user_id join app_role r on r.id=u.role_id and r.tenant_id=u.tenant_id join tenant t on t.id=u.tenant_id
  where rt.token_hash=p_token_hash and rt.revoked_at is null and rt.expires_at>now() and u.is_active
$$;
create or replace function eureach_create_refresh_token(p_id uuid,p_tenant_id uuid,p_user_id uuid,p_token_hash text,p_days integer)
returns void language sql security definer set search_path=public as $$
  insert into refresh_token(id,tenant_id,user_id,token_hash,expires_at) values(p_id,p_tenant_id,p_user_id,p_token_hash,now()+make_interval(days=>p_days));
$$;
create or replace function eureach_revoke_refresh_token(p_id uuid)
returns void language sql security definer set search_path=public as $$
  update refresh_token set revoked_at=now() where id=p_id;
$$;

create or replace function eureach_revoke_refresh_token_by_hash(p_token_hash text) returns void language sql security definer set search_path=public as $$ update refresh_token set revoked_at=now() where token_hash=p_token_hash and revoked_at is null; $$;
