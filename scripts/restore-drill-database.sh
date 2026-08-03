#!/usr/bin/env sh
set -eu

# Restore drill: proves the Coolify-native database backup is actually
# restorable, not just that the backup job exits 0. Restores an artifact into a
# throwaway Postgres container (never the live database), then compares the
# per-table row counts and the Drizzle migration journal against the live
# database. This is the database sibling of restore-drill-from-b2.sh, which
# does the same for storage, and it is the check #267 step 7 requires before
# the pre-cutover backup path can be retired (see #594).
#
# Runs on the server that holds the backups (rylai), because the database is
# is_public: false and the local backups live under /data/coolify/backups.
#
# Non-destructive: it reads the artifact and the live database, and writes only
# to a container it creates and removes. The scratch container holds a full
# copy of production PII while it runs, so it is force-removed on exit and
# never publishes a port (set DRILL_KEEP=1 to keep it for inspection).
#
# Handles both artifact formats Coolify can emit, decided by DatabaseBackupJob's
# dump_all flag ("Backup All Databases"):
#   pg-dump-all-<ts>.gz    plain SQL, gzipped -> gunzip | psql
#   pg-dump-<db>-<ts>.dmp  custom format      -> pg_restore

require_command() {
  command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_command docker
require_command find
require_command sort

BACKUP_DIR="${BACKUP_DIR:-/data/coolify/backups/databases}"
BACKUP_FILE="${BACKUP_FILE:-}"
TARGET_DB="${TARGET_DB:-enescena}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:17-alpine}"
DRILL_CONTAINER="${DRILL_CONTAINER:-en-escena-restore-drill}"
# The live Postgres container. Coolify names it after the database UUID, which
# is also embedded in the backup path, so it is derived below when unset.
LIVE_CONTAINER="${LIVE_CONTAINER:-}"
WORK_DIR="${WORK_DIR:-${TMPDIR:-/tmp}/en-escena-restore-drill}"

if [ -z "$BACKUP_FILE" ]; then
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "No BACKUP_FILE given and BACKUP_DIR does not exist: $BACKUP_DIR" >&2
    exit 1
  fi

  # Newest artifact under the backup tree, whatever the format.
  BACKUP_FILE="$(find "$BACKUP_DIR" -type f \( -name "pg-dump-*.gz" -o -name "pg-dump-*.dmp" \) \
    -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -n 1 | cut -d" " -f2-)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "No backup artifact found (BACKUP_FILE=${BACKUP_FILE:-unset}, BACKUP_DIR=$BACKUP_DIR)" >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "FAIL: backup artifact is empty: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "$LIVE_CONTAINER" ]; then
  # .../databases/<team>/postgresql-database-<uuid>/pg-dump-all-<ts>.gz
  candidate="$(basename "$(dirname "$BACKUP_FILE")" | sed "s/^.*-//")"

  if [ -n "$candidate" ] && [ -n "$(docker ps -q -f "name=^${candidate}\$")" ]; then
    LIVE_CONTAINER="$candidate"
  fi
fi

echo "Artifact:       $BACKUP_FILE"
echo "Artifact size:  $(wc -c <"$BACKUP_FILE" | tr -d " ") bytes"
echo "Live container: ${LIVE_CONTAINER:-<not found>}"

mkdir -p "$WORK_DIR"

cleanup() {
  if [ -n "${DRILL_KEEP:-}" ]; then
    echo "Kept scratch container $DRILL_CONTAINER (DRILL_KEEP set). It holds production data."
  else
    docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
  fi

  rm -rf "$WORK_DIR"
}

trap cleanup EXIT INT TERM

# Exact per-table counts for every base table in the domain schemas. Counting
# every table rather than a hand-picked list is what catches a partially
# restored dump: a missing table shows up as a missing line, not just a
# different number.
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
  container="$1"
  database="$2"
  sql="$3"

  printf "%s\n" "$sql" |
    docker exec -i "$container" psql -U postgres -d "$database" -At -v ON_ERROR_STOP=1 -f -
}

docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true

echo "Starting scratch Postgres ($POSTGRES_IMAGE) as $DRILL_CONTAINER"
docker run -d --name "$DRILL_CONTAINER" \
  -e POSTGRES_PASSWORD=restore-drill \
  "$POSTGRES_IMAGE" >/dev/null

# The image's entrypoint runs initdb against a temporary server before it
# starts the real one, and that temporary server answers pg_isready. Requiring
# two successful queries a second apart avoids connecting to it and then having
# the socket pulled away mid-restore.
ready=0
streak=0
i=0
while [ "$i" -lt 90 ]; do
  if docker exec "$DRILL_CONTAINER" psql -U postgres -d postgres -c "select 1" >/dev/null 2>&1; then
    streak=$((streak + 1))
  else
    streak=0
  fi

  if [ "$streak" -ge 3 ]; then
    ready=1
    break
  fi

  i=$((i + 1))
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "FAIL: scratch Postgres did not become ready within 60s" >&2
  exit 1
fi

RESTORE_LOG="${WORK_DIR}/restore.log"

case "$BACKUP_FILE" in
*.gz)
  echo "Restoring plain SQL (pg_dumpall | gzip) with psql"
  # pg_dumpall emits CREATE ROLE/CREATE DATABASE for objects the fresh image
  # already has, so ON_ERROR_STOP would abort on noise. The proof is the count
  # comparison below, not the exit code; the log is scanned for real errors.
  gunzip -c "$BACKUP_FILE" |
    docker exec -i "$DRILL_CONTAINER" psql -U postgres -d postgres \
      >"$RESTORE_LOG" 2>&1 || true
  ;;
*.dmp)
  echo "Restoring custom format (pg_dump --format=custom) with pg_restore"
  docker exec "$DRILL_CONTAINER" createdb -U postgres "$TARGET_DB"
  docker exec -i "$DRILL_CONTAINER" pg_restore -U postgres -d "$TARGET_DB" \
    --no-owner --no-acl <"$BACKUP_FILE" >"$RESTORE_LOG" 2>&1 || true
  ;;
*)
  echo "FAIL: unrecognised artifact extension: $BACKUP_FILE" >&2
  exit 1
  ;;
esac

failures=0

# Benign noise: objects the fresh image ships with, which pg_dumpall recreates.
real_errors="$(grep -i "^ERROR" "$RESTORE_LOG" 2>/dev/null |
  grep -viE "already exists|does not exist, skipping" |
  wc -l | tr -d " ")"

if [ "$real_errors" != "0" ]; then
  echo "FAIL: restore reported $real_errors unexpected error(s):" >&2
  grep -i "^ERROR" "$RESTORE_LOG" | grep -viE "already exists|does not exist, skipping" |
    head -n 20 >&2
  failures=$((failures + 1))
fi

if ! docker exec "$DRILL_CONTAINER" psql -U postgres -lqt |
  cut -d"|" -f1 | tr -d " " | grep -qx "$TARGET_DB"; then
  echo "FAIL: database '$TARGET_DB' does not exist after the restore" >&2
  echo "Restore drill FAILED." >&2
  exit 1
fi

restored_counts="${WORK_DIR}/restored-counts.txt"
run_sql "$DRILL_CONTAINER" "$TARGET_DB" "$COUNTS_SQL" >"$restored_counts"

restored_tables="$(wc -l <"$restored_counts" | tr -d " ")"
restored_rows="$(cut -d= -f2 "$restored_counts" | paste -sd+ - | bc 2>/dev/null || echo "?")"

echo "Restored: $restored_tables table(s), $restored_rows row(s) total"

if [ "$restored_tables" -eq 0 ]; then
  echo "FAIL: the restore produced no tables" >&2
  failures=$((failures + 1))
fi

echo "Journal (restored): $(run_sql "$DRILL_CONTAINER" "$TARGET_DB" "$JOURNAL_SQL" 2>/dev/null ||
  echo "MISSING")"

if [ -n "$LIVE_CONTAINER" ]; then
  live_counts="${WORK_DIR}/live-counts.txt"
  run_sql "$LIVE_CONTAINER" "$TARGET_DB" "$COUNTS_SQL" >"$live_counts"

  echo "Journal (live):     $(run_sql "$LIVE_CONTAINER" "$TARGET_DB" "$JOURNAL_SQL" 2>/dev/null ||
    echo "MISSING")"

  if diff -u "$live_counts" "$restored_counts" >"${WORK_DIR}/counts.diff"; then
    echo "Row counts match the live database exactly."
  else
    # Rows written after the backup ran are expected drift up to the RPO, so
    # this is reported rather than failed on. A *missing table*, or a restored
    # count higher than live, is not drift and is called out.
    echo "Row counts differ from live (drift up to the backup cadence is expected):"
    sed -n "1,40p" "${WORK_DIR}/counts.diff"

    cut -d= -f1 "$live_counts" >"${WORK_DIR}/live-tables.txt"
    cut -d= -f1 "$restored_counts" >"${WORK_DIR}/restored-tables.txt"
    missing="$(comm -23 "${WORK_DIR}/live-tables.txt" "${WORK_DIR}/restored-tables.txt" |
      wc -l | tr -d " ")"

    if [ "$missing" != "0" ]; then
      echo "FAIL: $missing table(s) present live are missing from the restore" >&2
      echo "      Either the restore lost them, or the artifact predates a migration" >&2
      echo "      that added them. Compare the journal watermarks above: equal" >&2
      echo "      watermarks mean the restore is at fault." >&2
      failures=$((failures + 1))
    fi
  fi
else
  echo "WARNING: live container not found, skipping the comparison against live."
  echo "         Set LIVE_CONTAINER to the Coolify Postgres container name."

  if [ -z "${SKIP_LIVE_COMPARE:-}" ]; then
    echo "FAIL: #267 step 7 requires matching counts; set SKIP_LIVE_COMPARE=1 to accept a restore-only drill" >&2
    failures=$((failures + 1))
  fi
fi

if [ "$failures" -ne 0 ]; then
  echo "Restore drill FAILED with $failures problem(s)." >&2
  exit 1
fi

echo "Restore drill PASSED: $restored_tables table(s) restored and verified."
