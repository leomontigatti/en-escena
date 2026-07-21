#!/usr/bin/env sh
set -eu

# Restore drill: proves the B2 storage backup is actually restorable, not just
# that it exists. Restores each backed-up bucket from B2 into a throwaway
# staging dir (never the live volume), then checks the restore is non-empty,
# matches the object count in the backup, and reads back a sample object. When
# the live volume is reachable it also reports drift against it. This is the
# "restore, not just backup" check the storage cutover requires (see #401).
#
# Non-destructive: it only reads from B2 and writes to a temp dir that is wiped
# on exit (set RESTORE_KEEP=1 to keep it for inspection). Keys are restored
# intact (`academies/...`), so a real recovery is a plain copy of the staged
# tree back onto STORAGE_VOLUME_DIR with no key rewriting.

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

require_command aws
require_command mkdir
require_command find
require_command wc

B2_FILESTORE_BUCKET="${B2_FILESTORE_BUCKET:-${B2_BUCKET:-}}"
B2_FILESTORE_PREFIX="${B2_FILESTORE_PREFIX:-filestore}"
STORAGE_BACKUP_BUCKETS="${STORAGE_BACKUP_BUCKETS:-en-escena-dancer-documents,en-escena-choreography-music}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-005}"
RESTORE_TARGET_DIR="${RESTORE_TARGET_DIR:-${TMPDIR:-/tmp}/en-escena-restore-drill}"
# Optional: point at the live volume to also report drift (backup vs live).
STORAGE_VOLUME_DIR="${STORAGE_VOLUME_DIR:-}"

export AWS_DEFAULT_REGION

if [ -z "$B2_FILESTORE_BUCKET" ]; then
  echo "Missing required environment variable: B2_FILESTORE_BUCKET" >&2
  exit 1
fi

mkdir -p "$RESTORE_TARGET_DIR"

cleanup() {
  # The staged tree holds restored PII, so wipe it unless asked to keep it.
  if [ -n "${RESTORE_KEEP:-}" ]; then
    echo "Kept restored data at $RESTORE_TARGET_DIR (RESTORE_KEEP set)."
  else
    rm -rf "$RESTORE_TARGET_DIR"
  fi
}

trap cleanup EXIT INT TERM

total_restored=0
failures=0

for bucket in $(printf "%s" "$STORAGE_BACKUP_BUCKETS" | tr "," " "); do
  if [ -z "$bucket" ]; then
    continue
  fi

  B2_URI="s3://${B2_FILESTORE_BUCKET}/${B2_FILESTORE_PREFIX}/${bucket}"
  RESTORE_BUCKET_DIR="${RESTORE_TARGET_DIR}/${bucket}"

  mkdir -p "$RESTORE_BUCKET_DIR"

  echo "Restoring $B2_URI to $RESTORE_BUCKET_DIR"
  aws s3 sync "$B2_URI" "$RESTORE_BUCKET_DIR" \
    --endpoint-url "$B2_S3_ENDPOINT" \
    --only-show-errors

  backup_count="$(aws s3 ls "${B2_URI}/" --recursive \
    --endpoint-url "$B2_S3_ENDPOINT" | wc -l | tr -d ' ')"
  restored_count="$(find "$RESTORE_BUCKET_DIR" -type f | wc -l | tr -d ' ')"

  echo "  backup objects: $backup_count | restored files: $restored_count"

  if [ "$restored_count" != "$backup_count" ]; then
    echo "  FAIL: restored file count does not match backup object count" >&2
    failures=$((failures + 1))
  fi

  # A matching count is not enough: an empty or truncated object would mean the
  # backup is corrupt even when the counts line up, so read back one object.
  sample="$(find "$RESTORE_BUCKET_DIR" -type f | head -n 1)"
  if [ -n "$sample" ]; then
    if [ -s "$sample" ]; then
      echo "  sample OK: $sample"
    else
      echo "  FAIL: restored sample is empty: $sample" >&2
      failures=$((failures + 1))
    fi
  fi

  # If the live volume is reachable, report how far the backup lags it. Some
  # drift is expected up to the backup cadence (RPO), so this is informational.
  if [ -n "$STORAGE_VOLUME_DIR" ] && [ -d "${STORAGE_VOLUME_DIR}/${bucket}" ] &&
    command -v diff >/dev/null 2>&1; then
    drift="$(diff -qr "${STORAGE_VOLUME_DIR}/${bucket}" "$RESTORE_BUCKET_DIR" 2>&1 |
      wc -l | tr -d ' ')"
    echo "  drift vs live volume: $drift path(s) differ (expected up to RPO)"
  fi

  total_restored=$((total_restored + restored_count))
done

if [ "$total_restored" -eq 0 ]; then
  echo "FAIL: restore drill restored 0 files across all buckets" >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "Restore drill FAILED with $failures problem(s)." >&2
  exit 1
fi

echo "Restore drill PASSED: $total_restored file(s) restored and verified."
