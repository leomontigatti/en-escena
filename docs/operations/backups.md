# Backups

This runbook covers production backups to Backblaze B2:

- daily logical PostgreSQL dumps;
- storage-volume object backups.

## Scope

- Database source: the self-hosted Postgres container managed by Coolify, backed
  up by Coolify's own Scheduled Backup on the database resource. Not Supabase —
  the database moved in the cutover of #267.
- Storage source: the local storage volume (`STORAGE_VOLUME_DIR`) on the São
  Paulo VPS, which is the live byte store after the cutover in #399. B2 is only a
  backup destination now, not the live store.
- Destination: a Backblaze B2 bucket through its S3-compatible endpoint, plus a
  local copy on the VPS for the database.
- Database format: plain SQL from `pg_dumpall`, gzipped. See
  [Database Backup](#database-backup-coolify-native).
- Storage format: copied objects under a B2 prefix, keys intact (`academies/...`).
- Frequency: database on the cadence configured on the Coolify database resource;
  storage on the cadence configured for its scheduled task (base 2x/day, raised
  during an event window to shrink the RPO).
- Retention: the database backup keeps 30 days in B2 and 7 days locally. Coolify
  and the B2 lifecycle rule are deliberately aligned on the same 30 days, so
  either can expire an object without the other disagreeing. Storage retention is
  managed by the B2 lifecycle rule alone.

Both backups are logical dumps. This is not PITR: a restore can only reach the
moment when the dump started.

The storage backup syncs the local volume into B2. In the default `copy` mode it
does not delete B2 objects that are no longer present on the volume, so
accidental deletes on the volume do not immediately remove the backup copy. Set
`BACKUP_SYNC_MODE=mirror` to prune deleted objects so the backup tracks the
volume exactly.

## Database Backup (Coolify native)

The database backup is configured on the **Postgres resource** in Coolify, not on
the application. There is no script and nothing in this repo to run.

- Destination: the B2 bucket registered under Coolify's _S3 Storages_ as
  `enescena-db-backups` (unhyphenated — see #588). The hyphenated
  `en-escena-db-backups` belongs to the retired script path and goes away with
  the Supabase decommission (#303).
- Local copies are kept as well, under
  `/data/coolify/backups/databases/<team>/<resource>/` on the VPS, with 7-day
  retention. Keep "Disable Local Backup" **unchecked**: those copies are what
  make a fast local restore possible without a B2 round-trip.
- Cadence, retention and the S3 target are all edited in the Coolify UI on that
  resource.

### Format

With **"Backup All Databases" checked** — the current setting, decided in #302 in
exchange for Coolify's one-click restore — Coolify runs:

```sh
docker exec <container> pg_dumpall --username postgres | gzip > pg-dump-all-<timestamp>.gz
```

That is **plain SQL**, restored with `gunzip | psql`. `pg_restore` cannot read it.

Unchecked, Coolify instead runs `pg_dump --format=custom --no-acl --no-owner`
against the named database and writes `pg-dump-<database>-<timestamp>.dmp`, which
`pg_restore` handles. Whether to switch is open in #594; it matters because
`db:refresh:prod` consumes these backups (#595).

**Coolify's own restore handles both formats.** Its import form has a "Backup
includes all databases" checkbox that selects the restore command: checked, it
drops every non-template database, recreates the target and pipes
`gunzip -cf | psql`; unchecked, it runs `pg_restore -U … -d …` from an editable
command field (the UI itself suggests adding `--clean`). So the format choice
does not cost the one-click restore path, contrary to what #302 assumed. The
practical difference is that the `pg_dumpall` branch cleans up after itself and
the `pg_restore` branch does not unless you add `--clean`.

Either way the dump covers the whole `enescena` database — every schema,
including `public` and `drizzle`. Coolify's database selection is per _database_,
not per schema, so the schema rename in #506 does not affect it.

## Backblaze B2 Setup

Create separate B2 buckets for database and filestore backups because they have
different lifecycle policies. A practical starting point for En Escena is:

- database bucket: keep database backups for 30 days, matching the retention
  configured in Coolify;
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

The database backup needs none of these — it is configured entirely in Coolify.
The `B2_DATABASE_*` block below belongs to `scripts/backup-database-to-b2.sh`,
which still runs in parallel and is retired in #594 once the native backup has
passed a restore test.

```sh
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
client version must be equal to or newer than the Postgres server version;
otherwise `pg_dump` aborts with a server version mismatch. The server runs
`postgres:17-alpine`, so keep both pinned to 17.

The native database backup needs none of this — it runs `docker exec` against the
Postgres container itself, using that image's own client.

If running the backup directly on a Debian/Ubuntu VPS instead, install the
system packages with:

```sh
sudo apt-get update
sudo apt-get install -y awscli postgresql-client-17
```

If the VPS package repository does not provide `postgresql-client-17`, add the
official PostgreSQL apt repository first.

## Manual Backup

For the database, use **Backup Now** on the Coolify database resource.

From the repo root, for storage — and, until #594 retires it, the legacy database
script:

```sh
pnpm backup:db:b2      # legacy, retired in #594
pnpm backup:storage:b2
```

The database script writes a temporary file under `tmp/db-backups/`, uploads it
to B2, and removes the local file on exit. The storage script syncs each bucket
directory under `STORAGE_VOLUME_DIR` straight to B2, keys intact; there is no
local staging copy.

## Daily Schedule

The **database** backup is scheduled on the Coolify Postgres resource, not here.

A legacy scheduled task on the production application still runs
`sh scripts/backup-database-to-b2.sh` in parallel against the same database. It
is redundant, not broken — the script reads `DATABASE_URL`, which the cutover
repointed at the internal Postgres. Both it and its task are retired in #594.

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

## Database Restore Drill

Prove the database backup restores, not just that the backup job exits 0. The
drill restores an artifact into a **throwaway Postgres container** — never into
`enescena` — then compares per-table row counts and the Drizzle migration
journal against the live database. This is the check #267 step 7 requires.

Run it on the server, because the database is `is_public: false` and the local
copies live under `/data/coolify/backups`:

```sh
# on rylai, from the app checkout
pnpm restore:db:drill

# or without a checkout
sh scripts/restore-drill-database.sh
```

With no arguments it picks the newest artifact under
`/data/coolify/backups/databases`, detects the format from the extension, and
finds the live container from the backup path. Useful overrides:

| Variable            | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `BACKUP_FILE`       | Drill a specific artifact instead of the newest one.                 |
| `BACKUP_DIR`        | Where to search for artifacts.                                       |
| `LIVE_CONTAINER`    | The Coolify Postgres container, when it cannot be derived.           |
| `SKIP_LIVE_COMPARE` | Accept a restore-only drill with no live comparison.                 |
| `DRILL_KEEP`        | Keep the scratch container for inspection. It holds production data. |

It handles both artifact formats (see [Format](#format)) without configuration:
`.gz` restores through `gunzip \| psql`, `.dmp` through `pg_restore`.

Reading the result:

- **Row counts match exactly** — the strongest outcome, and what to expect when
  nothing has been written since the backup ran.
- **Counts differ** — reported, not failed. Rows written after the backup are
  expected drift up to the backup cadence.
- **A table present live is missing from the restore** — a failure. Compare the
  two journal watermarks the drill prints: if they are equal, the restore lost
  the table; if the restored watermark is older, the artifact simply predates
  the migration that added it.
- **Unexpected errors during the restore** — a failure. `already exists` noise
  from objects the fresh image ships with is filtered out; anything else is not.

To drill a B2 copy rather than a local one, download it first and pass
`BACKUP_FILE`.

The scratch container holds a full copy of production PII while it runs. It
publishes no port and is force-removed on exit unless `DRILL_KEEP` is set.

Run the drill monthly and before every event. A backup that has not been
restored is unproven.

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
