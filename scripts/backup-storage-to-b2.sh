#!/usr/bin/env sh
set -eu

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

require_env B2_BUCKET
require_env B2_S3_ENDPOINT
require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY
require_env SUPABASE_STORAGE_S3_ACCESS_KEY_ID
require_env SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY
require_env SUPABASE_STORAGE_S3_ENDPOINT
require_env SUPABASE_STORAGE_S3_REGION

require_command aws
require_command date
require_command mkdir
require_command rm
require_command tr

APP_NAME="${APP_NAME:-en-escena}"
B2_FILESTORE_PREFIX="${B2_FILESTORE_PREFIX:-filestore}"
BACKUP_TMP_DIR="${BACKUP_TMP_DIR:-tmp/storage-backups}"
STORAGE_BACKUP_BUCKETS="${STORAGE_BACKUP_BUCKETS:-dancer-documents}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
RUN_TMP_DIR="${BACKUP_TMP_DIR}/${APP_NAME}-${TIMESTAMP}"

export AWS_DEFAULT_REGION

mkdir -p "$RUN_TMP_DIR"

cleanup() {
  rm -rf "$RUN_TMP_DIR"
}

trap cleanup EXIT INT TERM

for bucket in $(printf "%s" "$STORAGE_BACKUP_BUCKETS" | tr "," " "); do
  if [ -z "$bucket" ]; then
    continue
  fi

  LOCAL_BUCKET_DIR="${RUN_TMP_DIR}/${bucket}"
  B2_URI="s3://${B2_BUCKET}/${B2_FILESTORE_PREFIX}/${bucket}"

  mkdir -p "$LOCAL_BUCKET_DIR"

  echo "Downloading Supabase Storage bucket: $bucket"
  AWS_ACCESS_KEY_ID="$SUPABASE_STORAGE_S3_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="$SUPABASE_STORAGE_S3_REGION" \
    aws s3 sync "s3://${bucket}" "$LOCAL_BUCKET_DIR" \
      --endpoint-url "$SUPABASE_STORAGE_S3_ENDPOINT" \
      --only-show-errors

  echo "Uploading bucket backup to $B2_URI"
  aws s3 sync "$LOCAL_BUCKET_DIR" "$B2_URI" \
    --endpoint-url "$B2_S3_ENDPOINT" \
    --only-show-errors
done

echo "Storage backup completed for buckets: $STORAGE_BACKUP_BUCKETS"
