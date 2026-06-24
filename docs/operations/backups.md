# Backups

This runbook covers the first production backup path: daily logical PostgreSQL
dumps uploaded to Backblaze B2. It does not cover Supabase Storage object
backups; configure those separately.

## Scope

- Source: the production `DATABASE_URL` for Supabase Postgres.
- Destination: a Backblaze B2 bucket through its S3-compatible endpoint.
- Format: compressed custom-format `pg_dump` archive.
- Frequency: daily.
- Retention: managed in B2 with lifecycle rules, not by the app script.

The backup script creates a logical dump. It is not PITR and can only restore to
the moment when the dump started.

## Backblaze B2 Setup

Create a dedicated B2 bucket for backups. Enable lifecycle rules on the bucket
or prefix so old objects are deleted automatically. A practical starting point
for En Escena is:

- keep daily database backups for 7 days;
- keep weekly or monthly copies with a separate lifecycle policy if longer
  retention is needed;
- restrict the application key to the backup bucket only;
- use a key that can write and list the backup prefix.

Use the S3 endpoint shown by Backblaze for the bucket region, for example:

```sh
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
```

## Required Environment

Configure these values in the scheduled-job environment. Do not commit real
secrets.

```sh
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
B2_BUCKET="en-escena-backups"
B2_PREFIX="database"
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
AWS_ACCESS_KEY_ID="your-b2-application-key-id"
AWS_SECRET_ACCESS_KEY="your-b2-application-key"
AWS_DEFAULT_REGION="us-east-005"
```

`DATABASE_URL` should use the Supabase direct connection or session pooler.
Avoid the transaction pooler for dumps.

## Runtime Requirements

The scheduled environment needs:

- `pg_dump`;
- AWS CLI v2.

The production Docker image installs these tools in the runtime stage so the
Coolify scheduled task can run inside the application container.

If running the backup directly on a Debian/Ubuntu VPS instead, install the
system packages with:

```sh
sudo apt-get update
sudo apt-get install -y awscli postgresql-client
```

If the VPS package repository ships an older PostgreSQL client, install the
PostgreSQL client version closest to the hosted Supabase Postgres version.

## Manual Backup

From the repo root:

```sh
npm run backup:db:b2
```

The script writes a temporary file under `tmp/db-backups/`, uploads it to B2,
and removes the local file on exit.

## Daily Schedule

Use a daily schedule outside the request-serving runtime. In Coolify, configure
a scheduled task on the production application:

- Command: `npm run backup:db:b2`
- Schedule: `20 3 * * *`
- Environment: use the production variables configured in Coolify.

The scheduled task should inherit the app environment. If it does not, define
the backup variables directly on the scheduled task.

For a host-level cron fallback, use:

```cron
20 3 * * * cd /path/to/en-escena && npm run backup:db:b2 >> /var/log/en-escena-db-backup.log 2>&1
```

## Restore Check

Download one backup from B2 and inspect the archive list before trusting the
setup:

```sh
aws s3 cp \
  "s3://$B2_BUCKET/$B2_PREFIX/en-escena-YYYYMMDD-HHMMSS.dump" \
  "tmp/db-backups/restore-check.dump" \
  --endpoint-url "$B2_S3_ENDPOINT"

pg_restore --list tmp/db-backups/restore-check.dump | head -40
```

For a full restore into a fresh database:

```sh
createdb "$RESTORE_DATABASE_NAME"
pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" \
  tmp/db-backups/restore-check.dump
```

Run a restore test monthly. A backup that has not been restored is unproven.
