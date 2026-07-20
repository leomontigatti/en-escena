#!/usr/bin/env sh
set -eu

# One-shot re-seed of the local storage volume from the current B2 buckets,
# performed once during the cutover away from B2-as-live-store. Keys are copied
# intact (`academies/...`, `music_storage_key`,
# `document_{front,back}_image_storage_key`), so the app keeps resolving the
# same storage keys against the local volume that it used against B2.
#
# Uses `aws s3 sync` (checksum-aware: it skips objects whose size and mtime
# already match) so the re-seed is safe to re-run and resumable. Point
# STORAGE_SOURCE_ENDPOINT at the live bucket store you are migrating from; it
# defaults to B2.

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

require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY
require_env STORAGE_VOLUME_DIR

require_command aws
require_command mkdir

STORAGE_SOURCE_ENDPOINT="${STORAGE_SOURCE_ENDPOINT:-${B2_S3_ENDPOINT:-}}"
STORAGE_BACKUP_BUCKETS="${STORAGE_BACKUP_BUCKETS:-en-escena-dancer-documents,en-escena-choreography-music}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"

export AWS_DEFAULT_REGION

if [ -z "$STORAGE_SOURCE_ENDPOINT" ]; then
  echo "Missing required environment variable: STORAGE_SOURCE_ENDPOINT" >&2
  exit 1
fi

mkdir -p "$STORAGE_VOLUME_DIR"

for bucket in $(printf "%s" "$STORAGE_BACKUP_BUCKETS" | tr "," " "); do
  if [ -z "$bucket" ]; then
    continue
  fi

  LOCAL_BUCKET_DIR="${STORAGE_VOLUME_DIR}/${bucket}"

  mkdir -p "$LOCAL_BUCKET_DIR"

  echo "Re-seeding volume bucket $LOCAL_BUCKET_DIR from s3://${bucket}"
  aws s3 sync "s3://${bucket}" "$LOCAL_BUCKET_DIR" \
    --endpoint-url "$STORAGE_SOURCE_ENDPOINT" \
    --only-show-errors
done

echo "Volume re-seed completed for buckets: $STORAGE_BACKUP_BUCKETS"
