#!/bin/sh
set -eu
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
file="${1:?usage: scripts/restore.sh <backup.dump>}"
case "${CONFIRM_RESTORE:-}" in
  YES) ;;
  *) echo 'Refusing restore: set CONFIRM_RESTORE=YES' >&2; exit 2;;
esac
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$ADMIN_DATABASE_URL" "$file"
