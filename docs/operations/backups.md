# Backups

This runbook covers production backups to Backblaze B2:

- daily logical PostgreSQL dumps;
- daily Supabase Storage object backups.

## Scope

- Database source: the production `DATABASE_URL` for Supabase Postgres.
- Storage source: configured Supabase Storage buckets through the S3-compatible
  API.
- Destination: a Backblaze B2 bucket through its S3-compatible endpoint.
- Database format: compressed custom-format `pg_dump` archive.
- Storage format: copied objects under a B2 prefix.
- Frequency: daily.
- Retention: managed in B2 with lifecycle rules, not by the app script.

The backup script creates a logical dump. It is not PITR and can only restore to
the moment when the dump started.

The storage backup copies current Supabase Storage objects into B2. It does not
delete B2 objects that are no longer present in Supabase Storage, so accidental
deletes in Supabase do not immediately remove the backup copy.

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
B2_FILESTORE_PREFIX="filestore"
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
AWS_ACCESS_KEY_ID="your-b2-application-key-id"
AWS_SECRET_ACCESS_KEY="your-b2-application-key"
AWS_DEFAULT_REGION="us-east-005"

STORAGE_BACKUP_BUCKETS="dancer-documents"
SUPABASE_STORAGE_S3_ENDPOINT="https://your-project-ref.storage.supabase.co/storage/v1/s3"
SUPABASE_STORAGE_S3_REGION="your-supabase-project-region"
SUPABASE_STORAGE_S3_ACCESS_KEY_ID="your-supabase-storage-s3-access-key-id"
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="your-supabase-storage-s3-secret-access-key"
```

`DATABASE_URL` should use the Supabase direct connection or session pooler.
Avoid the transaction pooler for dumps.

Generate the Supabase Storage S3 credentials from the project's Storage S3
settings. Supabase says S3 access keys are server-side credentials that provide
full S3 access across buckets and bypass RLS, so keep them only in Coolify
environment variables.

## Runtime Requirements

The scheduled environment needs:

- `pg_dump`;
- AWS CLI v2.

The production Docker image installs PostgreSQL client 17 in the runtime stage
so the Coolify scheduled task can run inside the application container. The
client version must be equal to or newer than the Supabase Postgres server
version; otherwise `pg_dump` aborts with a server version mismatch.

If running the backup directly on a Debian/Ubuntu VPS instead, install the
system packages with:

```sh
sudo apt-get update
sudo apt-get install -y awscli postgresql-client-17
```

If the VPS package repository does not provide `postgresql-client-17`, add the
official PostgreSQL apt repository first.

## Manual Backup

From the repo root:

```sh
npm run backup:db:b2
npm run backup:storage:b2
```

The database script writes a temporary file under `tmp/db-backups/`, uploads it
to B2, and removes the local file on exit. The storage script downloads each
configured bucket under `tmp/storage-backups/`, uploads the objects to B2, and
removes the local copy on exit.

## Daily Schedule

Use a daily schedule outside the request-serving runtime. In Coolify, configure
a scheduled task on the production application:

- Command: `npm run backup:db:b2`
- Schedule: `20 3 * * *`
- Environment: use the production variables configured in Coolify.

Add a second scheduled task for Storage:

- Command: `npm run backup:storage:b2`
- Schedule: `40 3 * * *`
- Environment: use the production variables configured in Coolify.

The scheduled task should inherit the app environment. If it does not, define
the backup variables directly on the scheduled task.

For a host-level cron fallback, use:

```cron
20 3 * * * cd /path/to/en-escena && npm run backup:db:b2 >> /var/log/en-escena-db-backup.log 2>&1
40 3 * * * cd /path/to/en-escena && npm run backup:storage:b2 >> /var/log/en-escena-storage-backup.log 2>&1
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

## Storage Restore Check

List the copied objects in B2:

```sh
aws s3 ls "s3://$B2_BUCKET/$B2_FILESTORE_PREFIX/dancer-documents/" \
  --recursive \
  --endpoint-url "$B2_S3_ENDPOINT"
```

To restore one bucket into Supabase Storage, copy from B2 into a temporary
directory and then sync it to the Supabase Storage bucket:

```sh
aws s3 sync \
  "s3://$B2_BUCKET/$B2_FILESTORE_PREFIX/dancer-documents" \
  "tmp/storage-restore/dancer-documents" \
  --endpoint-url "$B2_S3_ENDPOINT"

AWS_ACCESS_KEY_ID="$SUPABASE_STORAGE_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$SUPABASE_STORAGE_S3_REGION" \
  aws s3 sync \
    "tmp/storage-restore/dancer-documents" \
    "s3://dancer-documents" \
    --endpoint-url "$SUPABASE_STORAGE_S3_ENDPOINT"
```
