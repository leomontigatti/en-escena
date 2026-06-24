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

require_env DATABASE_URL
require_env B2_BUCKET
require_env B2_S3_ENDPOINT
require_env AWS_ACCESS_KEY_ID
require_env AWS_SECRET_ACCESS_KEY

require_command aws
require_command date
require_command mkdir
require_command pg_dump
require_command rm

APP_NAME="${APP_NAME:-en-escena}"
B2_PREFIX="${B2_PREFIX:-database}"
BACKUP_TMP_DIR="${BACKUP_TMP_DIR:-tmp/db-backups}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_BASENAME="${APP_NAME}-${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_TMP_DIR}/${BACKUP_BASENAME}"
B2_URI="s3://${B2_BUCKET}/${B2_PREFIX}/${BACKUP_BASENAME}"

export AWS_DEFAULT_REGION

mkdir -p "$BACKUP_TMP_DIR"

cleanup() {
  rm -f "$BACKUP_PATH"
}

trap cleanup EXIT INT TERM

echo "Creating compressed PostgreSQL dump at $BACKUP_PATH"
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file "$BACKUP_PATH" \
  "$DATABASE_URL"

echo "Uploading backup to $B2_URI"
aws s3 cp "$BACKUP_PATH" "$B2_URI" \
  --endpoint-url "$B2_S3_ENDPOINT" \
  --only-show-errors

echo "Database backup uploaded: $B2_URI"
