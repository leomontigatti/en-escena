#!/usr/bin/env sh
set -eu

# Resets staging to a copy of production as it is right now: the database from
# a fresh pg_dump of the live one, and the storage volume (music, documents,
# feedback audio) mirrored from production's. Whatever staging held before is
# replaced. See docs/operations/staging.md.
#
# Runs on rylai, where both environments live: `pnpm staging:reset` pipes it
# there over SSH. Production is only read: pg_dump takes a consistent snapshot
# without blocking writes, and the storage volume is the source of an rsync.
#
# The staging app is stopped while its database is replaced and started again
# afterwards; its entrypoint then applies any migration the deployed branch has
# that production does not, so a branch under test runs on production data.

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command docker
require_command rsync
require_command flock

# Coolify names a database container after the resource UUID, and an
# application container after the UUID plus a per-deploy suffix.
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-c24udczenueosjssymgxuhgf}"
PROD_STORAGE_DIR="${PROD_STORAGE_DIR:-/var/lib/en-escena/storage}"
STAGING_DB_CONTAINER="${STAGING_DB_CONTAINER:-jjhyytvgi9suem6e8sygshvp}"
STAGING_APP_UUID="${STAGING_APP_UUID:-ojdw5oppaq326mgohwvqew1s}"
# Where the app reads its storage from, inside its container.
STORAGE_MOUNT_PATH="/var/lib/en-escena/storage"
DATABASE_NAME="enescena"
LOCK_FILE="/run/lock/en-escena-staging-reset.lock"

# Two resets at once would restore each other's half-written dumps.
exec 9>"$LOCK_FILE"

if ! flock -n 9; then
  echo "Another staging reset is running" >&2
  exit 1
fi

# The one mistake this script must not make is writing to production, so the
# targets are checked against the sources before anything runs.
if [ "$STAGING_DB_CONTAINER" = "$PROD_DB_CONTAINER" ]; then
  echo "Refusing: the staging database is the production one" >&2
  exit 1
fi

if [ -z "$(docker ps -q -f "name=^${PROD_DB_CONTAINER}\$")" ]; then
  echo "Production database container is not running: $PROD_DB_CONTAINER" >&2
  exit 1
fi

if [ -z "$(docker ps -q -f "name=^${STAGING_DB_CONTAINER}\$")" ]; then
  echo "Staging database container is not running: $STAGING_DB_CONTAINER" >&2
  echo "Start it from Coolify first." >&2
  exit 1
fi

# The running container is the one serving staging. A stopped one is only
# picked when it is the only container there is: after a failed deploy two may
# exist, and stopping the wrong one would leave the app writing to the database
# while it is being replaced.
app_container="$(docker ps --format "{{.Names}}" -f "name=^${STAGING_APP_UUID}-")"

if [ -z "$app_container" ]; then
  app_container="$(docker ps -a --format "{{.Names}}" -f "name=^${STAGING_APP_UUID}-")"
fi

if [ -z "$app_container" ]; then
  echo "No staging app container found for $STAGING_APP_UUID; deploy it from Coolify first" >&2
  exit 1
fi

if [ "$(printf "%s\n" "$app_container" | wc -l)" -ne 1 ]; then
  echo "More than one staging app container; leave one in Coolify and retry:" >&2
  printf "%s\n" "$app_container" >&2
  exit 1
fi

# Staging keeps its files in a Docker volume Coolify created, so the host
# directory is read off the container rather than assumed.
STAGING_STORAGE_DIR="$(docker inspect "$app_container" \
  --format "{{range .Mounts}}{{if eq .Destination \"$STORAGE_MOUNT_PATH\"}}{{.Source}}{{end}}{{end}}")"

if [ -z "$STAGING_STORAGE_DIR" ]; then
  echo "The staging app has no volume at $STORAGE_MOUNT_PATH" >&2
  exit 1
fi

if [ "$(realpath -m "$STAGING_STORAGE_DIR")" = "$(realpath -m "$PROD_STORAGE_DIR")" ]; then
  echo "Refusing: the staging storage directory is the production one" >&2
  exit 1
fi

# Private to this run: the dump is a full copy of production PII.
umask 077
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/en-escena-staging-reset.XXXXXX")"
dump="$WORK_DIR/production.dmp"

cleanup() {
  rm -rf "$WORK_DIR"
}

trap cleanup EXIT INT TERM

echo "Dumping production ($PROD_DB_CONTAINER)"
docker exec "$PROD_DB_CONTAINER" pg_dump -U postgres -d "$DATABASE_NAME" --format=custom >"$dump"
echo "Dump size: $(wc -c <"$dump" | tr -d " ") bytes"

echo "Stopping the staging app ($app_container)"
docker stop "$app_container" >/dev/null

echo "Replacing the staging database ($STAGING_DB_CONTAINER)"
docker exec "$STAGING_DB_CONTAINER" dropdb -U postgres --if-exists --force "$DATABASE_NAME"
docker exec "$STAGING_DB_CONTAINER" createdb -U postgres "$DATABASE_NAME"
docker exec -i "$STAGING_DB_CONTAINER" pg_restore -U postgres -d "$DATABASE_NAME" \
  --no-owner --no-acl --exit-on-error <"$dump"

echo "Mirroring storage into $STAGING_STORAGE_DIR"
rsync -a --delete "$PROD_STORAGE_DIR/" "$STAGING_STORAGE_DIR/"
echo "Storage size: $(du -sh "$STAGING_STORAGE_DIR" | cut -f1)"

echo "Starting the staging app"
docker start "$app_container" >/dev/null

echo "Staging reset to production as of $(date -u +"%Y-%m-%d %H:%M UTC")."
echo "The app applies pending migrations as it starts; follow it in Coolify's logs."
