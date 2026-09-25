#!/bin/sh
# Disaster-recovery drill: proves the backup/restore chain end to end,
# not just that the scripts exist. This is the sequence the September
# status report identified as unverified:
#
#   backup exists -> backup is valid -> backup can be restored ->
#   restore is complete -> application can reconnect -> data integrity
#   verified
#
# This script performs every step against a REAL Postgres instance:
#   1. seed a marker row with a known value in the source database
#   2. run scripts/backup.sh against it
#   3. drop the database entirely (simulating real data loss, not just
#      restoring into a copy)
#   4. recreate an empty database
#   5. run scripts/restore.sh against the dump
#   6. verify the marker row -- and its exact value -- survived
#
# It deliberately does NOT restore into a side database and diff it;
# doing that would prove the dump file is readable, not that a real
# recovery brings the application's actual database back with its data
# intact. This script proves the second, stronger claim.
#
# Requires: ADMIN_DATABASE_URL pointing at a disposable Postgres database
# (never point this at production -- step 3 drops it), with
# 001_core_schema.sql and migrations/002_runtime_role.sh already applied.
# Run: sh scripts/dr-drill.sh
set -eu
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required (the database dr-drill.sh will drop and recreate)}"

MARKER_TENANT_SLUG="dr-drill-$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_DIR="$(mktemp -d)"
DUMP_FILE="$DUMP_DIR/dr-drill.dump"

echo "== 1/6: seeding marker row in $PGDATABASE =="
MARKER_TENANT_ID=$(psql "$ADMIN_DATABASE_URL" -X -t -A -v ON_ERROR_STOP=1 -c \
  "insert into tenant(id, slug, name, industry_key) values (gen_random_uuid(), '$MARKER_TENANT_SLUG', 'DR Drill Marker', 'ngo') returning id")
echo "   marker tenant id: $MARKER_TENANT_ID"

echo "== 2/6: running scripts/backup.sh =="
BACKUP_FILE=$(sh scripts/backup.sh "$DUMP_FILE")
echo "   backup written: $BACKUP_FILE"
[ -s "$BACKUP_FILE" ] || { echo "FAIL: backup file is empty"; exit 1; }

echo "== diagnostic: does the dump actually contain tenant table data? =="
pg_restore --list "$BACKUP_FILE" | grep -i "TABLE DATA.*tenant" \
  || echo "   WARNING: no 'TABLE DATA ... tenant' entry found in the dump's table of contents"

echo "== 3/6: dropping $PGDATABASE to simulate real data loss =="
dropdb --if-exists --host="$PGHOST" --username="$PGUSER" "$PGDATABASE"

echo "== 4/6: recreating an empty $PGDATABASE =="
createdb --host="$PGHOST" --username="$PGUSER" "$PGDATABASE"

echo "== 5/6: running scripts/restore.sh against the dump =="
CONFIRM_RESTORE=YES sh scripts/restore.sh "$BACKUP_FILE"
RESTORE_EXIT=$?
echo "   restore.sh exit code: $RESTORE_EXIT"

echo "== diagnostic: how many rows are in tenant right now? =="
psql "$ADMIN_DATABASE_URL" -X -t -A -v ON_ERROR_STOP=1 -c "select count(*) from tenant" \
  || echo "   (that query itself failed -- see error above)"

echo "== 6/6: verifying the marker row survived with its exact value =="
RESTORED_ID=$(psql "$ADMIN_DATABASE_URL" -X -t -A -v ON_ERROR_STOP=1 -c \
  "select id from tenant where slug='$MARKER_TENANT_SLUG'")
if [ "$RESTORED_ID" != "$MARKER_TENANT_ID" ]; then
  echo "FAIL: marker tenant not found (or id mismatch) after restore -- restore did not recover the data"
  exit 1
fi

echo "== cleanup: removing marker row and temp dump =="
psql "$ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "delete from tenant where id='$RESTORED_ID'" >/dev/null
rm -rf "$DUMP_DIR"

echo "PASS: backup -> destroy -> restore -> integrity check succeeded"
