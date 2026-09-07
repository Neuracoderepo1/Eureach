-- Launch hardening: idempotent outreach, stricter DB function exposure, and retention indexes.
alter table outreach_attempt add column if not exists idempotency_key text;
create unique index if not exists uq_outreach_attempt_idempotency
  on outreach_attempt(tenant_id, idempotency_key)
  where idempotency_key is not null;

-- SECURITY DEFINER functions are intentionally callable only by the runtime role.
revoke all on function eureach_auth_user(text,text) from public;
revoke all on function eureach_refresh_user(text) from public;
revoke all on function eureach_create_refresh_token(uuid,uuid,uuid,text,integer) from public;
revoke all on function eureach_revoke_refresh_token(uuid) from public;
revoke all on function eureach_revoke_refresh_token_by_hash(text) from public;
grant execute on function eureach_auth_user(text,text) to eureach_app;
grant execute on function eureach_refresh_user(text) to eureach_app;
grant execute on function eureach_create_refresh_token(uuid,uuid,uuid,text,integer) to eureach_app;
grant execute on function eureach_revoke_refresh_token(uuid) to eureach_app;
grant execute on function eureach_revoke_refresh_token_by_hash(text) to eureach_app;

-- Make security-definer search paths explicit and resistant to object-shadowing.
alter function eureach_auth_user(text,text) set search_path = pg_catalog, public;
alter function eureach_refresh_user(text) set search_path = pg_catalog, public;
alter function eureach_create_refresh_token(uuid,uuid,uuid,text,integer) set search_path = pg_catalog, public;
alter function eureach_revoke_refresh_token(uuid) set search_path = pg_catalog, public;
alter function eureach_revoke_refresh_token_by_hash(text) set search_path = pg_catalog, public;

create index if not exists idx_notification_unread
  on notification(tenant_id, recipient_id, created_at desc)
  where read_at is null;
create index if not exists idx_campaign_tenant_status
  on campaign(tenant_id, status, created_at desc);

-- Refresh-token cleanup can be run safely from a scheduled database job.
create or replace function eureach_cleanup_refresh_tokens(p_before timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare deleted_count integer;
begin
  delete from refresh_token where expires_at < p_before or revoked_at < p_before - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function eureach_cleanup_refresh_tokens(timestamptz) from public;
