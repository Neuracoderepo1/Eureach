#!/bin/bash
set -euo pipefail
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
create role eureach_app login password :'app_password' nosuperuser nocreatedb nocreaterole noinherit;
grant connect on database eureach to eureach_app;
grant usage on schema public to eureach_app;
grant select,insert,update,delete on all tables in schema public to eureach_app;
grant execute on function eureach_auth_user(text,text) to eureach_app;
grant execute on function eureach_refresh_user(text) to eureach_app;
grant execute on function eureach_create_refresh_token(uuid,uuid,uuid,text,integer) to eureach_app;
grant execute on function eureach_revoke_refresh_token(uuid) to eureach_app;
grant execute on function eureach_revoke_refresh_token_by_hash(text) to eureach_app;
alter default privileges in schema public grant select,insert,update,delete on tables to eureach_app;
SQL
