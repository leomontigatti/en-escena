# Backups

This runbook covers production backups to Backblaze B2:

- daily logical PostgreSQL dumps;
- storage-volume object backups.

## Scope

- Database source: the production `DATABASE_URL` for Supabase Postgres.
- Storage source: the local storage volume (`STORAGE_VOLUME_DIR`) on the São
  Paulo VPS, which is the live byte store after the cutover in #399. B2 is only a
  backup destination now, not the live store.
- Destination: a Backblaze B2 bucket through its S3-compatible endpoint.
- Database format: compressed custom-format `pg_dump` archive.
- Storage format: copied objects under a B2 prefix, keys intact (`academies/...`).
- Frequency: database daily; storage on the cadence configured for its scheduled
  task (base 2x/day, raised during an event window to shrink the RPO).
- Retention: managed in B2 with lifecycle rules, not by the app script.

The backup script creates a logical dump. It is not PITR and can only restore to
the moment when the dump started.

The storage backup syncs the local volume into B2. In the default `copy` mode it
does not delete B2 objects that are no longer present on the volume, so
accidental deletes on the volume do not immediately remove the backup copy. Set
`BACKUP_SYNC_MODE=mirror` to prune deleted objects so the backup tracks the
volume exactly.

## Backblaze B2 Setup

Create separate B2 buckets for database and filestore backups because they have
different lifecycle policies. A practical starting point for En Escena is:

- database bucket: keep daily database backups for 30 days;
- filestore bucket: keep copied objects for 90 or 180 days, depending on cost
  and recovery needs;
- restrict the application key to the two backup buckets only;
- use a key that can write and list the backup prefixes.

Use the S3 endpoint shown by Backblaze for the bucket region, for example:

```sh
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
```

## Required Environment

Configure these values in the scheduled-job environment. Do not commit real
secrets.

```sh
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
B2_DATABASE_BUCKET="en-escena-db-backups"
B2_DATABASE_PREFIX="database"
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
AWS_ACCESS_KEY_ID="your-b2-application-key-id"
AWS_SECRET_ACCESS_KEY="your-b2-application-key"
AWS_DEFAULT_REGION="us-east-005"

STORAGE_VOLUME_DIR="/var/lib/en-escena/storage"
STORAGE_BACKUP_BUCKETS="en-escena-dancer-documents,en-escena-choreography-music"
BACKUP_SYNC_MODE="copy"
B2_FILESTORE_BUCKET="en-escena-filestore-backups"
B2_FILESTORE_PREFIX="filestore"
```

`DATABASE_URL` should use the Supabase direct connection or session pooler.
Avoid the transaction pooler for dumps.

`B2_DATABASE_BUCKET` and `B2_FILESTORE_BUCKET` are intentionally separate. The
database script still accepts the legacy `B2_BUCKET` and `B2_PREFIX` variables
as fallbacks, but new production configuration should use the explicit bucket
and prefix variables.

`STORAGE_BACKUP_BUCKETS` names the on-disk bucket directories under
`STORAGE_VOLUME_DIR` (which are also the prefixes under `B2_FILESTORE_PREFIX` in
B2). The storage backup no longer reads from Supabase Storage, so no
`SUPABASE_STORAGE_S3_*` credentials are needed for it.

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
pnpm backup:db:b2
pnpm backup:storage:b2
```

The database script writes a temporary file under `tmp/db-backups/`, uploads it
to B2, and removes the local file on exit. The storage script syncs each bucket
directory under `STORAGE_VOLUME_DIR` straight to B2, keys intact; there is no
local staging copy.

## Daily Schedule

Use a daily schedule outside the request-serving runtime. In Coolify, configure
a scheduled task on the production application:

- Command: `sh scripts/backup-database-to-b2.sh`
- Schedule: `20 3 * * *`
- Environment: use the production variables configured in Coolify.

Add a scheduled task for Storage. Its base cadence is twice a day, raised during
an event window to shrink the RPO:

- Command: `sh scripts/backup-storage-to-b2.sh`
- Schedule: `0 3,15 * * *`
- Environment: use the production variables configured in Coolify.

Invoke the scripts with `sh`, not `pnpm`, in scheduled tasks. The production
image is pruned with `pnpm prune --prod`, so it has no `husky`; a `pnpm <script>`
call triggers the `prepare` lifecycle and fails with `husky: not found` before
the script runs (and re-downloads pnpm through corepack each time). Calling the
script directly skips all of that — it only needs `sh` and the AWS CLI, both in
the image. The container's WORKDIR is `/app`, so the relative path resolves.

The scheduled task should inherit the app environment. If it does not, define
the backup variables directly on the scheduled task.

For a host-level cron fallback, use:

```cron
20 3 * * * cd /path/to/en-escena && pnpm backup:db:b2 >> /var/log/en-escena-db-backup.log 2>&1
0 3,15 * * * cd /path/to/en-escena && pnpm backup:storage:b2 >> /var/log/en-escena-storage-backup.log 2>&1
```

The storage scripts only need the AWS CLI (no `pg_dump`). If the runtime where
they run does not have it — the São Paulo VPS host does not — run the AWS CLI
from the `amazon/aws-cli` Docker image with the volume bind-mounted, instead of
installing it on the host.

## Restore Check

Download one backup from B2 and inspect the archive list before trusting the
setup:

```sh
aws s3 cp \
  "s3://$B2_DATABASE_BUCKET/$B2_DATABASE_PREFIX/en-escena-YYYYMMDD-HHMMSS.dump" \
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

## Storage Restore Drill

Prove the storage backup is restorable, not just that it exists. The drill
restores every backed-up bucket from B2 into a throwaway staging dir (never the
live volume), then checks that the restore is non-empty, that its file count
matches the object count in the backup, and that a sample object reads back
intact. Point `STORAGE_VOLUME_DIR` at the live volume to also report drift
(backup vs live), which is expected up to the backup cadence (RPO).

```sh
pnpm restore:storage:drill
```

The drill is non-destructive: it only reads from B2 and wipes its staging dir on
exit. Set `RESTORE_KEEP=1` to keep the restored tree for inspection, and
`RESTORE_TARGET_DIR` to choose where it stages. It exits non-zero if any bucket
restores zero files, a count does not match, or a restored object is empty — so
it can gate a scheduled check.

Run it monthly, at minimum. A backup that has not been restored is unproven.
Schedule it as a Coolify scheduled task with `sh scripts/restore-drill-from-b2.sh`
(not `pnpm` — see the Daily Schedule note above); Coolify's non-zero exit code
then drives the failure notification.

For a real recovery, run the drill with `RESTORE_KEEP=1` (or point
`RESTORE_TARGET_DIR` at a scratch dir), then copy the verified tree back onto the
volume — keys are intact, so no rewriting is needed:

```sh
cp -a "$RESTORE_TARGET_DIR/en-escena-dancer-documents/." \
  "$STORAGE_VOLUME_DIR/en-escena-dancer-documents/"
```

On the São Paulo VPS host, run the AWS CLI steps from the `amazon/aws-cli` Docker
image with the relevant directories bind-mounted, since the host has no `aws`.

## Encryption at Rest (accepted debt)

The storage volume (`/var/lib/en-escena/storage`) holds dancer documents — PII
such as ID scans and medical certificates — as plaintext files on the VPS disk.
Encryption at rest would protect those bytes only against disk-level access
without the key: a decommissioned or stolen physical disk, or a leaked
block-level provider snapshot. It does not protect against an attacker with root
on the running box (the key is loaded and the volume mounted) or against the
hypervisor.

**Decision: accepted as documented debt, not implemented.**

- **Owner:** Leo Monti (@leomontigatti).
- **Date:** 2026-07-21.
- **Why deferred:** Hostinger offers no customer-facing at-rest encryption for
  VPS volumes — the "Disk Encryption" control in their Trust Center covers their
  own corporate devices, databases, and backups, not a toggle on your VPS block
  storage. The remaining option is self-managed LUKS inside the guest, whose
  auto-unlock keyfile would live on the same server, so it only raises the bar
  against disk-only leaks while adding boot/operational risk. Judged not worth it
  for the current threat model.
- **Accepted threat:** if the disk or a provider snapshot leaks, the PII in the
  volume is readable.
- **Revisit trigger:** a compliance requirement (e.g. a data-protection audit or
  a client/regulatory obligation), a move off Hostinger to a provider with
  encrypted block storage, or splitting the volume onto a dedicated device. See
  #401 and the note in `.env.example`.
