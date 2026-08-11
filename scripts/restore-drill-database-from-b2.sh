#!/usr/bin/env sh
set -eu

# Restore drill: proves the Coolify-native database backup is actually
# restorable, on a schedule. Pulls the newest artifact from B2, restores it into
# a scratch database on the live Postgres server, compares per-table row counts
# and the Drizzle migration journal against the live database, then drops the
# scratch database. Exiting non-zero is the whole point: Coolify turns that into
# a TaskFailed notification (see #594).
#
# This is the automated sibling of restore-drill-database.sh. That one restores
# into a throwaway Postgres container and is the stricter check, but it needs a
# Docker socket and the local backup directory, so it only runs on rylai by
# hand. This one needs neither, so it runs as a Coolify Scheduled Task on the
# *application* resource -- the only resource type Coolify lets you attach a
# scheduled task to. Standalone databases have no scheduled_tasks relation, no
# route and no UI for it, so "schedule it on the Postgres resource" is not an
# option however sensible it sounds.
#
# The trade it makes for that: the restore lands on the production Postgres
# server rather than an isolated container, so it shares that server's disk,
# CPU and connection slots. Acceptable while the dump is small; revisit if the
# database grows by orders of magnitude.
#
# Requires a custom-format artifact (#594 item 2). Plain SQL from pg_dumpall
# carries \connect directives that repoint the session mid-stream, which is
# exactly what you must not do on a live server, so this script refuses those
# rather than restoring them somewhere unintended.
#
# Destructive only to SCRATCH_DB, which it creates and drops. It never writes to
# the live database, and it refuses to run if SCRATCH_DB and the live database
# name are the same. While it runs, SCRATCH_DB holds a full copy of production
# PII on the production server, so it is dropped on exit (DRILL_KEEP=1 keeps it).

require_env() {
  name="$1"
  eval "value=\${$name:-}"

  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

# A schemeless endpoint is rejected by the awscli, but only once it is already
# running and talking about its own --endpoint-url flag. Failing here instead
# names the variable that drifted, which is what an operator has to go fix.
require_url_env() {
  name="$1"
  require_env "$name"
  eval "value=\${$name:-}"

  case "$value" in
    http://* | https://*) ;;
    *)
      echo "Invalid $name: must start with http:// or https:// (got: $value)" >&2
      exit 1
      ;;
  esac
}

require_command() {
  command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_env DATABASE_URL

# BACKUP_FILE drills an artifact that is already on disk and skips B2 entirely:
# the break-glass path when you are on rylai with a local copy, and what makes
# the script exercisable without credentials.
if [ -z "${BACKUP_FILE:-}" ]; then
  require_url_env B2_S3_ENDPOINT
  require_env AWS_ACCESS_KEY_ID
  require_env AWS_SECRET_ACCESS_KEY

  require_command aws
fi

require_command psql
require_command pg_restore
require_command sed
require_command sort
require_command cut
require_command comm
require_command diff

COOLIFY_BACKUP_BUCKET="${COOLIFY_BACKUP_BUCKET:-enescena-db-backups}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"
SCRATCH_DB="${SCRATCH_DB:-enescena_restore_drill}"
WORK_DIR="${WORK_DIR:-${TMPDIR:-/tmp}/en-escena-db-restore-drill}"
# Optional: drill a specific S3 key instead of the newest artifact.
BACKUP_KEY="${BACKUP_KEY:-}"

export AWS_DEFAULT_REGION

# The scratch database name is interpolated into SQL, so keep it to identifier
# characters rather than trusting quoting to hold.
case "$SCRATCH_DB" in
*[!a-zA-Z0-9_]* | "")
  echo "SCRATCH_DB must be a plain SQL identifier: $SCRATCH_DB" >&2
  exit 1
  ;;
esac

# libpq takes the database from the URL's path, so reaching the maintenance
# database and the scratch database means rewriting that path. Split the query
# string off first: it carries sslmode and friends, which must survive.
url_without_query="${DATABASE_URL%%\?*}"

case "$DATABASE_URL" in
*\?*) url_query="?${DATABASE_URL#*\?}" ;;
*) url_query="" ;;
esac

url_prefix="${url_without_query%/*}"
TARGET_DB="${TARGET_DB:-${url_without_query##*/}}"

if [ -z "$TARGET_DB" ]; then
  echo "Could not read a database name from DATABASE_URL" >&2
  exit 1
fi

if [ "$SCRATCH_DB" = "$TARGET_DB" ]; then
  echo "Refusing to run: SCRATCH_DB ($SCRATCH_DB) is the live database" >&2
  exit 1
fi

ADMIN_URL="${url_prefix}/postgres${url_query}"
SCRATCH_URL="${url_prefix}/${SCRATCH_DB}${url_query}"
LIVE_URL="$DATABASE_URL"

mkdir -p "$WORK_DIR"

drop_scratch() {
  psql "$ADMIN_URL" -q -At -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}

cleanup() {
  if [ -n "${DRILL_KEEP:-}" ]; then
    echo "Kept scratch database $SCRATCH_DB (DRILL_KEEP set). It holds production data."
  else
    drop_scratch
  fi

  rm -rf "$WORK_DIR"
}

trap cleanup EXIT INT TERM

if [ -n "${BACKUP_FILE:-}" ]; then
  BACKUP_KEY="$BACKUP_FILE"
elif [ -z "$BACKUP_KEY" ]; then
  # Coolify writes the S3 key as a mirror of the host path, so the artifacts sit
  # under data/coolify/backups/databases/<team>/<resource>/. Sorting on the
  # listing's date and time columns avoids depending on the timestamp embedded
  # in the filename.
  BACKUP_KEY="$(aws s3 ls "s3://${COOLIFY_BACKUP_BUCKET}" --recursive \
    --endpoint-url "$B2_S3_ENDPOINT" |
    grep -E "/pg-dump-[^/]+\.(dmp|gz)$" |
    sort -k1,2 | tail -n 1 |
    sed -E "s/^[^ ]+ +[^ ]+ +[0-9]+ +//")"
fi

if [ -z "$BACKUP_KEY" ]; then
  echo "FAIL: no backup artifact found in s3://${COOLIFY_BACKUP_BUCKET}" >&2
  exit 1
fi

if [ -z "${BACKUP_FILE:-}" ]; then
  echo "Bucket:   s3://${COOLIFY_BACKUP_BUCKET}"
fi

echo "Artifact: $BACKUP_KEY"

case "$BACKUP_KEY" in
*.dmp) ;;
*.gz)
  echo "FAIL: $BACKUP_KEY is gzipped plain SQL from pg_dumpall." >&2
  echo "      Restoring it here would run \\connect against the live server, so" >&2
  echo "      this drill refuses it. Either the Coolify backup still has 'Backup" >&2
  echo "      All Databases' checked -- uncheck it, per #594 item 2 -- or the" >&2
  echo "      newest artifact predates that change. Use restore-drill-database.sh" >&2
  echo "      on rylai for the old format." >&2
  exit 1
  ;;
*)
  echo "FAIL: unrecognised artifact extension: $BACKUP_KEY" >&2
  exit 1
  ;;
esac

if [ -n "${BACKUP_FILE:-}" ]; then
  ARTIFACT="$BACKUP_FILE"

  if [ ! -f "$ARTIFACT" ]; then
    echo "FAIL: BACKUP_FILE does not exist: $ARTIFACT" >&2
    exit 1
  fi
else
  ARTIFACT="${WORK_DIR}/$(basename "$BACKUP_KEY")"

  aws s3 cp "s3://${COOLIFY_BACKUP_BUCKET}/${BACKUP_KEY}" "$ARTIFACT" \
    --endpoint-url "$B2_S3_ENDPOINT" --only-show-errors
fi

if [ ! -s "$ARTIFACT" ]; then
  echo "FAIL: downloaded artifact is empty: $BACKUP_KEY" >&2
  exit 1
fi

echo "Size:     $(wc -c <"$ARTIFACT" | tr -d " ") bytes"

# Exact per-table counts for every base table. Counting every table rather than
# a hand-picked list is what catches a partially restored dump: a missing table
# shows up as a missing line, not just a different number.
COUNTS_SQL="SELECT table_schema || '.' || table_name || '=' ||
  (xpath('/row/c/text()', query_to_xml(
    format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
    false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;"

# The journal watermark. drizzle-orm's migrator compares created_at, not the
# hash, so a restore that loses the journal would silently re-run every
# migration on the next deploy (see #593).
JOURNAL_SQL="SELECT count(*) || ' migrations, watermark ' || coalesce(max(created_at)::text, 'none')
FROM drizzle.__drizzle_migrations;"

run_sql() {
  url="$1"
  sql="$2"

  printf "%s\n" "$sql" | psql "$url" -At -v ON_ERROR_STOP=1 -f -
}

# A scratch database left behind by a killed run would otherwise fail CREATE.
drop_scratch

echo "Restoring into scratch database $SCRATCH_DB"
psql "$ADMIN_URL" -q -At -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$SCRATCH_DB\";" >/dev/null

RESTORE_LOG="${WORK_DIR}/restore.log"
restore_status=0

pg_restore --no-owner --no-acl -d "$SCRATCH_URL" "$ARTIFACT" \
  >"$RESTORE_LOG" 2>&1 || restore_status=$?

failures=0

# pg_restore tags its own failures `pg_restore: error:`, which an anchored
# ^ERROR pattern never matches -- the trap that let an earlier version of the
# sibling drill pass on an artifact that had restored nothing.
real_error_lines() {
  grep -E "(^|[: ])(ERROR|FATAL|PANIC):|pg_restore: error:" "$RESTORE_LOG" 2>/dev/null |
    grep -viE "already exists|does not exist, skipping" || true
}

real_errors="$(real_error_lines | wc -l | tr -d " ")"

if [ "$real_errors" != "0" ]; then
  echo "FAIL: restore reported $real_errors unexpected error(s):" >&2
  real_error_lines | head -n 20 >&2
  failures=$((failures + 1))
fi

if [ "$restore_status" -ne 0 ]; then
  echo "FAIL: pg_restore exited $restore_status" >&2
  failures=$((failures + 1))
fi

restored_counts="${WORK_DIR}/restored-counts.txt"
run_sql "$SCRATCH_URL" "$COUNTS_SQL" >"$restored_counts"

restored_tables="$(wc -l <"$restored_counts" | tr -d " ")"

echo "Restored: $restored_tables table(s)"

if [ "$restored_tables" -eq 0 ]; then
  echo "FAIL: the restore produced no tables" >&2
  failures=$((failures + 1))
fi

echo "Journal (restored): $(run_sql "$SCRATCH_URL" "$JOURNAL_SQL" 2>/dev/null || echo "MISSING")"
echo "Journal (live):     $(run_sql "$LIVE_URL" "$JOURNAL_SQL" 2>/dev/null || echo "MISSING")"

live_counts="${WORK_DIR}/live-counts.txt"
run_sql "$LIVE_URL" "$COUNTS_SQL" >"$live_counts"

if diff -u "$live_counts" "$restored_counts" >"${WORK_DIR}/counts.diff"; then
  echo "Row counts match the live database exactly."
else
  echo "Row counts differ from live:"
  sed -n "1,40p" "${WORK_DIR}/counts.diff"

  # comm needs both sides in the same order, and psql sorted them under the
  # database collation rather than the shell's. Re-sort under a fixed one.
  cut -d= -f1 "$live_counts" | LC_ALL=C sort >"${WORK_DIR}/live-tables.txt"
  cut -d= -f1 "$restored_counts" | LC_ALL=C sort >"${WORK_DIR}/restored-tables.txt"
  missing="$(comm -23 "${WORK_DIR}/live-tables.txt" "${WORK_DIR}/restored-tables.txt" |
    wc -l | tr -d " ")"

  if [ "$missing" != "0" ]; then
    echo "FAIL: $missing table(s) present live are missing from the restore" >&2
    echo "      Either the restore lost them, or the artifact predates a migration" >&2
    echo "      that added them. Compare the journal watermarks above: equal" >&2
    echo "      watermarks mean the restore is at fault." >&2
    failures=$((failures + 1))
  fi

  # Split the surviving mismatches by direction. Fewer rows than live is what
  # drift looks like -- and also what a partial restore looks like. On a
  # schedule the two are indistinguishable without a quiet database, so drift is
  # accepted by default here and ALLOW_DRIFT is not consulted; the sibling drill
  # is the strict gate. More rows than live cannot be drift at all: the backup
  # was taken before now.
  short=0
  excess=0

  while IFS= read -r line; do
    table="${line%%=*}"
    live_rows="${line#*=}"
    restored_line="$(grep -F -m 1 -- "${table}=" "$restored_counts" || true)"

    if [ -z "$restored_line" ]; then
      continue
    fi

    rows="${restored_line#*=}"

    if [ "$rows" -lt "$live_rows" ]; then
      short=$((short + 1))
    elif [ "$rows" -gt "$live_rows" ]; then
      echo "      $table: restored $rows row(s) > live $live_rows" >&2
      excess=$((excess + 1))
    fi
  done <"$live_counts"

  if [ "$excess" != "0" ]; then
    echo "FAIL: $excess table(s) restored more rows than live holds, which is not drift" >&2
    failures=$((failures + 1))
  fi

  if [ "$short" != "0" ]; then
    echo "$short table(s) restored fewer rows than live; expected drift up to the backup cadence."
  fi
fi

if [ "$failures" -ne 0 ]; then
  echo "Restore drill FAILED with $failures problem(s)." >&2
  exit 1
fi

echo "Restore drill PASSED: $restored_tables table(s) restored and verified."
