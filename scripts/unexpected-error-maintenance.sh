#!/usr/bin/env sh
set -eu

# Unexpected error maintenance (#987), run as a Coolify scheduled task on the
# application resource, like the backup scripts (docs/operations/backups.md):
#
# 1. Deletes rows of en_escena_unexpected_error older than 90 days, the
#    retention the table promises (scripts/unexpected-error-retention.sql).
# 2. Compares the client connections in pg_stat_activity with max_connections
#    and posts to the ops Telegram chat when they reach
#    CONNECTION_ALERT_PERCENT (80 by default). The app pools without a
#    bouncer (docs/operations/infrastructure.md#database), so running out of
#    connections is how a busy event night would fail first (#419).
#
# With TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID unset the check only prints what
# it would have sent. A failed post exits non-zero, which Coolify turns into a
# TaskFailed notification on the same chat.

CONNECTION_ALERT_PERCENT="${CONNECTION_ALERT_PERCENT:-80}"
SCRIPT_DIR=$(dirname "$0")

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing required environment variable: DATABASE_URL" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Missing required command: psql" >&2
  exit 1
fi

# Three digits at most, so the comparisons below never meet a number the
# shell cannot hold.
case "$CONNECTION_ALERT_PERCENT" in
"" | *[!0-9]* | ????*) threshold_valid=false ;;
*) threshold_valid=true ;;
esac

if [ "$threshold_valid" = false ] || [ "$CONNECTION_ALERT_PERCENT" -lt 1 ] ||
  [ "$CONNECTION_ALERT_PERCENT" -gt 100 ]; then
  echo "CONNECTION_ALERT_PERCENT must be a whole number from 1 to 100: $CONNECTION_ALERT_PERCENT" >&2
  exit 1
fi

query() {
  psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"
}

deleted=$(query -f "$SCRIPT_DIR/unexpected-error-retention.sql")
echo "Deleted $deleted unexpected error rows older than 90 days"

# What the app's role can use: the slots reserved for superusers (and, from
# Postgres 16, for pg_use_reserved_connections) refuse it before
# max_connections is reached. Background workers do not count, nor does this
# script's own session.
usage=$(query -c "select count(*) filter (where backend_type = 'client backend' and pid <> pg_backend_pid()), current_setting('max_connections')::int - current_setting('superuser_reserved_connections')::int - coalesce(current_setting('reserved_connections', true)::int, 0) from pg_stat_activity")
used="${usage%%|*}"
limit="${usage##*|}"
percent=$((used * 100 / limit))

echo "Postgres connections: $used of $limit ($percent%), alert at $CONNECTION_ALERT_PERCENT%"

if [ "$percent" -lt "$CONNECTION_ALERT_PERCENT" ]; then
  exit 0
fi

message="[postgres:connections] $used of $limit connections in use ($percent%), alert at $CONNECTION_ALERT_PERCENT%
$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is unset; not sent:"
  echo "$message"
  exit 0
fi

set -- --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$message"

# Like the app's sender: a topic that is not a number would get the post
# refused, so the message goes to the chat itself instead.
case "${TELEGRAM_TOPIC_ID:-}" in
"") ;;
*[!0-9]*) echo "TELEGRAM_TOPIC_ID is not a number; posting to the chat itself" >&2 ;;
*) set -- "$@" --data-urlencode "message_thread_id=$TELEGRAM_TOPIC_ID" ;;
esac

# `--fail` without `--show-error` details: curl's error names the status,
# never the URL, so the token stays out of the task log.
if ! curl --silent --fail --max-time 10 --output /dev/null "$@" \
  "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage"; then
  echo "Could not post the connection alert to Telegram" >&2
  exit 1
fi

echo "Posted the connection alert to Telegram"
