#!/usr/bin/env sh
set -eu

# Backs up the live storage volume (local disk on the São Paulo VPS) to
# Backblaze B2, where B2 now serves only as a backup destination. The live byte
# store is the local Coolify volume; this cron is the volume's backup, separate
# from Coolify's native Scheduled Backup which only covers Postgres.
#
# Keys are copied intact (`academies/...`), so a restore is a plain copy back
# onto the volume with no key rewriting.
#
# Cadence is driven by the scheduler, not this script. Base cadence is 2x/day;
# during an event window the scheduler can invoke this far more often (down to
# every N minutes) to shrink the RPO. Set BACKUP_SYNC_MODE=mirror to prune
# objects deleted from the volume so the backup tracks it exactly.

require_env() {
  name="$1"
  eval "value=\${$name:-}"

  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_command() {
  command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_env B2_S3_ENDPOINT
require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY
require_env STORAGE_VOLUME_DIR

require_command aws
require_command mkdir

B2_FILESTORE_BUCKET="${B2_FILESTORE_BUCKET:-${B2_BUCKET:-}}"
B2_FILESTORE_PREFIX="${B2_FILESTORE_PREFIX:-filestore}"
STORAGE_BACKUP_BUCKETS="${STORAGE_BACKUP_BUCKETS:-en-escena-dancer-documents,en-escena-choreography-music}"
BACKUP_SYNC_MODE="${BACKUP_SYNC_MODE:-copy}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"

export AWS_DEFAULT_REGION

if [ -z "$B2_FILESTORE_BUCKET" ]; then
  echo "Missing required environment variable: B2_FILESTORE_BUCKET" >&2
  exit 1
fi

if [ ! -d "$STORAGE_VOLUME_DIR" ]; then
  echo "Storage volume directory not found: $STORAGE_VOLUME_DIR" >&2
  exit 1
fi

SYNC_EXTRA_ARGS=""
if [ "$BACKUP_SYNC_MODE" = "mirror" ]; then
  SYNC_EXTRA_ARGS="--delete"
elif [ "$BACKUP_SYNC_MODE" != "copy" ]; then
  echo "Invalid BACKUP_SYNC_MODE: $BACKUP_SYNC_MODE (expected copy or mirror)" >&2
  exit 1
fi

for bucket in $(printf "%s" "$STORAGE_BACKUP_BUCKETS" | tr "," " "); do
  if [ -z "$bucket" ]; then
    continue
  fi

  LOCAL_BUCKET_DIR="${STORAGE_VOLUME_DIR}/${bucket}"
  B2_URI="s3://${B2_FILESTORE_BUCKET}/${B2_FILESTORE_PREFIX}/${bucket}"

  # A bucket the app has not written to yet has no directory. Create it so the
  # sync is a no-op instead of an error.
  mkdir -p "$LOCAL_BUCKET_DIR"

  echo "Backing up volume bucket $LOCAL_BUCKET_DIR to $B2_URI"
  aws s3 sync "$LOCAL_BUCKET_DIR" "$B2_URI" \
    --endpoint-url "$B2_S3_ENDPOINT" \
    --only-show-errors \
    $SYNC_EXTRA_ARGS
done

echo "Storage backup completed for buckets: $STORAGE_BACKUP_BUCKETS"
