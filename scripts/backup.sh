#!/bin/sh
set -eu
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
out="${1:-./backups/eureach-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$out")"
pg_dump --format=custom --no-owner --no-acl "$ADMIN_DATABASE_URL" > "$out"
chmod 600 "$out"
printf '%s\n' "$out"
