# Backups

This runbook covers production backups to Backblaze B2:

- daily logical PostgreSQL dumps;
- storage-volume object backups.

What is being backed up — the Postgres resource and the storage volume — is
described in [Production infrastructure](./infrastructure.md); this runbook does
not restate it.

## Scope

- Database source: the Coolify-managed Postgres container, backed up by
  Coolify's own Scheduled Backup on the database resource.
- Storage source: the local storage volume (`STORAGE_VOLUME_DIR`), which is the
  live byte store. B2 is only a backup destination, not the live store.
- Destination: a Backblaze B2 bucket through its S3-compatible endpoint, plus a
  local copy on the VPS for the database.
- Database format: custom-format `pg_dump`, restored with `pg_restore`. Artifacts
  predating #594 are gzipped plain SQL from `pg_dumpall`. See
  [Database Backup](#database-backup-coolify-native).
- Storage format: copied objects under a B2 prefix, keys intact (`academies/...`).
- Frequency: database on the cadence configured on the Coolify database resource;
  storage on the cadence configured for its scheduled task (base 2x/day, raised
  during an event window to shrink the RPO).
- Retention: Coolify prunes the database dumps it wrote, both in B2 and in the
  local copies on the VPS. The B2 lifecycle rules do not expire anything by age
  on their own — neither bucket hides current versions — so what is retained is
  decided by Coolify for the database and by nothing at all for storage. See
  [Bucket lifecycle rules](#bucket-lifecycle-rules) for the rules as configured
  and why the two buckets cannot share a policy.

Both backups are logical dumps. This is not PITR: a restore can only reach the
moment when the dump started.

The storage backup syncs the local volume into B2. In the default `copy` mode it
does not delete B2 objects that are no longer present on the volume, so
accidental deletes on the volume do not immediately remove the backup copy. Set
`BACKUP_SYNC_MODE=mirror` to prune deleted objects so the backup tracks the
volume exactly.

That same non-pruning behaviour means an orphaned object — one left on the volume
with no row pointing at it, logged as `[storage:music:orphan]` and described in
[Production infrastructure](./infrastructure.md) — is copied to B2 on the next
sync and stays there. Nothing in the app touches the backup bucket, so
reconciling by hand means deleting the key in both places: on the volume under
`STORAGE_VOLUME_DIR`, and under
`s3://$B2_FILESTORE_BUCKET/$B2_FILESTORE_PREFIX/<bucket>/<key>`. Deleting only
the volume copy leaves the bytes paid for in B2 indefinitely: the bucket's
lifecycle rule only removes versions something has already deleted, so it never
reaches a copy that is still the current version there. See
[Bucket lifecycle rules](#bucket-lifecycle-rules).

## Database Backup (Coolify native)

The database backup is configured on the **Postgres resource** in Coolify, not on
the application. There is no script and nothing in this repo to run.

- Destination: the B2 bucket registered under Coolify's _S3 Storages_ as
  `enescena-db-backups` (unhyphenated — see #588). It is the **only** database
  backup destination. The hyphenated `en-escena-db-backups`, which belonged to
  the retired app-script path, was deleted with the Supabase decommission
  (#598 step 8) along with the pre-cutover dumps it held; no Supabase-era copy
  of the database exists anywhere now.
- Local copies are kept as well, under
  `/data/coolify/backups/databases/<team>/<resource>/` on the VPS, with 7-day
  retention. Keep "Disable Local Backup" **unchecked**: those copies are what
  make a fast local restore possible without a B2 round-trip.
- Cadence, retention and the S3 target are all edited in the Coolify UI on that
  resource.

### Format

**Decision (#594, item 2): the artifact is custom format — "Backup All Databases"
goes unchecked** on the Scheduled Backup of the Postgres resource. #302 had chosen
`pg_dumpall` in exchange for Coolify's one-click restore; that trade-off turned out
not to exist (see below), so the choice is now made on the merits. The checkbox is
edited in the Coolify UI; nothing in this repo controls it.

Unchecked, Coolify runs:

```sh
docker exec -e PGPASSWORD=… <container> \
  pg_dump --format=custom --no-acl --no-owner --username postgres enescena \
  > pg-dump-enescena-<timestamp>.dmp
```

The redirect happens on the host, not in the container, so the file is written
straight to `/data/coolify/backups/databases/<team>/<resource>/`. There is no
gzip step: custom format is already compressed.

What that buys, and why it was worth switching:

- `pg_restore` compatibility with the tooling that already exists.
  `db:refresh:prod` now consumes one of these artifacts directly (#595) instead
  of taking a second dump against the live database — see
  [Production Database Dump](../db/production-dump.md).
- Selective restore (`--table`, `--schema`), `--list` to inspect an artifact
  without restoring it, and `--clean`.
- A single-database restore can target one database, so an artifact can be
  restored into a scratch database on a running server. Plain `pg_dumpall`
  output carries `\connect` directives that repoint the session mid-stream,
  which makes pointing it at a live server hazardous.
- No wasted bytes on `postgres`/`template*`. The globals `pg_dumpall` adds are
  worthless here: the only role is `postgres`, which is why the existing dumps
  use `--no-owner --no-acl`.

Checked — the previous setting — it ran `pg_dumpall --username postgres | gzip`
into `pg-dump-all-<timestamp>.gz`, which is **plain SQL**, restored with
`gunzip | psql`. `pg_restore` cannot read it. Artifacts in that format stay in
the bucket until they age out of retention, so anything that reads backups must
keep handling both for now.

**Coolify's own restore handles both formats.** Its import form has a "Backup
includes all databases" checkbox that selects the restore command: checked, it
drops every non-template database, recreates the target and pipes
`gunzip -cf | psql`; unchecked, it runs `pg_restore -U … -d …` from an editable
command field (the UI itself suggests adding `--clean`). So the format choice
does not cost the one-click restore path, contrary to what #302 assumed. The
practical difference is that the `pg_dumpall` branch cleans up after itself and
the `pg_restore` branch does not unless you add `--clean`.

When restoring a `.dmp` through the import form, therefore: leave "Backup
includes all databases" **unchecked** and add `--clean` to the command field.

Either way the dump covers the whole `enescena` database — every schema,
including `public` and `drizzle`. Coolify's database selection is per _database_,
not per schema, so the schema rename in #506 does not affect it.

## Backblaze B2 Setup

Create separate B2 buckets for database and filestore backups because they have
different lifecycle policies — see [Bucket lifecycle rules](#bucket-lifecycle-rules)
below. For the application key:

- restrict the application key to the two backup buckets only;
- use a key that can write and list the backup prefixes.

### Bucket lifecycle rules

B2 lifecycle rules have two independent knobs, and the difference between them
matters more than the number of days:

- `daysFromUploadingToHiding` — hides the **current** version N days after it was
  uploaded. This expires live objects.
- `daysFromHidingToDeleting` — removes a version N days after it was hidden, that
  is, only after something else superseded or deleted it. This never touches a
  current version.

As configured (verified 2026-08-06):

- **`enescena-db-backups`**: `daysFromHidingToDeleting = 30`,
  `daysFromUploadingToHiding` unset. The rule is a cleanup pass behind Coolify,
  not a retention policy: Coolify decides how many dumps to keep and deletes the
  rest, and the rule clears the deleted versions 30 days later. Retention for the
  database is therefore whatever the Scheduled Backup on the Postgres resource
  says, edited in the Coolify UI.
- **`en-escena-filestore-backups`**: `daysFromHidingToDeleting = 30`,
  `daysFromUploadingToHiding` unset — the same shape, and for the same reason.
  It had no rule at all until #639; nothing had ever been expired from it.

**The filestore bucket must not get an age-based rule.** The storage backup ends
in `aws s3 sync` (`scripts/backup-storage-to-b2.sh`), which compares size and
mtime and skips what matches, so an object uploaded once and never modified is
written to B2 exactly once no matter how often the cron runs. Its age in B2 then
grows without bound while it is still live on the volume and still referenced by
its row. Dancer documents and choreography music are write-once in practice, so
that is the normal case, not the edge case: a `daysFromUploadingToHiding` rule
here would silently delete the backup copies of precisely the most stable files,
and nothing would look wrong until a restore was attempted. The database bucket
is the opposite — every run writes a brand-new object, so nothing there is both
old and current, and age-based expiry would be safe.

What it does take, `daysFromHidingToDeleting`, bounds the cost of versions that
are already superseded or deleted — which is what `BACKUP_SYNC_MODE=mirror`
produces, what deleting an orphaned key by hand produces, and what any future
retention job will produce — without ever expiring a live copy. Under the default
`copy` mode nothing in B2 is ever hidden, so the rule is currently inert; it is
there so that a switch to `mirror` does not silently start accumulating immortal
versions.

That inertness is the point to remember before designing any data-retention
policy: **a lifecycle rule cannot implement one.** The condition for deleting a
dancer document or a choreography music file lives in the database, which B2
knows nothing about, and a rule would act on the backup while the volume kept the
live copy. Retention has to be driven the other way — the app deletes from the
volume and clears the column in the same operation, `mirror` mode propagates the
deletion to B2, and only then does this rule reclaim the bytes.

Use the S3 endpoint shown by Backblaze for the bucket region, for example:

```sh
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
```

## Required Environment

Configure these values in the scheduled-job environment. Do not commit real
secrets.

The database backup itself needs none of these — it is configured entirely in
Coolify. What is left here belongs to the storage backup and to the scheduled
restore drill.

`COOLIFY_BACKUP_BUCKET` names the bucket Coolify's own backup writes to
(unhyphenated, #588), which the scheduled restore drill reads. It replaced the
retired `B2_DATABASE_BUCKET`, which pointed at the hyphenated bucket of the old
app-script path (#594 item 5). `B2_DATABASE_BUCKET`, `B2_DATABASE_PREFIX` and
`B2_PREFIX` were purged from the production environment with #598 step 8; the
bucket they named no longer exists.

```sh
B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
AWS_ACCESS_KEY_ID="your-b2-application-key-id"
AWS_SECRET_ACCESS_KEY="your-b2-application-key"
AWS_DEFAULT_REGION="us-east-005"

STORAGE_VOLUME_DIR="/var/lib/en-escena/storage"
STORAGE_BACKUP_BUCKETS="en-escena-dancer-documents,en-escena-choreography-music"
BACKUP_SYNC_MODE="copy"
B2_FILESTORE_BUCKET="en-escena-filestore-backups"
B2_FILESTORE_PREFIX="filestore"

COOLIFY_BACKUP_BUCKET="enescena-db-backups"
```

`COOLIFY_BACKUP_BUCKET` and `B2_FILESTORE_BUCKET` are intentionally separate:
they hold different kinds of data on different lifecycles.

The storage scripts still accept the legacy **`B2_BUCKET`** as a fallback for
`B2_FILESTORE_BUCKET` (`backup-storage-to-b2.sh` and `restore-drill-from-b2.sh`),
but new production configuration should set `B2_FILESTORE_BUCKET` explicitly.
**`B2_PREFIX` is read by nothing** — it was a fallback for `B2_DATABASE_PREFIX`
in the database script retired in #594 item 5, and `B2_FILESTORE_PREFIX` carries
its own default of `filestore`. Both legacy variables can be deleted from the
environment once `B2_FILESTORE_BUCKET` is set explicitly.

`STORAGE_BACKUP_BUCKETS` names the on-disk bucket directories under
`STORAGE_VOLUME_DIR` (which are also the prefixes under `B2_FILESTORE_PREFIX` in
B2). The storage backup no longer reads from Supabase Storage, so no
`SUPABASE_STORAGE_S3_*` credentials are needed for it.

## Runtime Requirements

The scheduled environment needs:

- `pg_restore` and `psql`, for the scheduled restore drill;
- AWS CLI v2.

The production Docker image installs PostgreSQL client 17 in the runtime stage so
the Coolify scheduled task can run inside the application container. It was
originally added for `backup-database-to-b2.sh`; **that script is gone (#594 item 5) and the client must stay**, because the scheduled restore drill needs
`pg_restore` and `psql` from the same package. The client version must be equal
to or newer than the Postgres server version, or `pg_restore` refuses the
archive. The server runs `postgres:17-alpine`, so keep both pinned to 17.

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

For storage, from the repo root:

```sh
pnpm backup:storage:b2
```

The storage script syncs each bucket directory under `STORAGE_VOLUME_DIR`
straight to B2, keys intact; there is no local staging copy.

## Daily Schedule

The **database** backup is scheduled on the Coolify Postgres resource, not here.
It is the only database backup: the parallel scheduled task that ran
`sh scripts/backup-database-to-b2.sh` was deleted, and the script with it, once
the native backup passed a restore drill (#594 items 1 and 5).

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

# or, without pnpm on PATH
sh scripts/restore-drill-database.sh
```

With no arguments it picks the newest artifact under
`/data/coolify/backups/databases`, detects the format from the extension, and
finds the live container from the backup path. Useful overrides:

| Variable            | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `BACKUP_FILE`       | Drill a specific artifact instead of the newest one.                      |
| `BACKUP_DIR`        | Where to search for artifacts.                                            |
| `TARGET_DB`         | The database to restore and compare. Defaults to `enescena`.              |
| `LIVE_CONTAINER`    | The Coolify Postgres container, when it cannot be derived.                |
| `SKIP_LIVE_COMPARE` | Accept a restore-only drill with no live comparison.                      |
| `ALLOW_DRIFT`       | Accept tables that restored fewer rows than live. See below.              |
| `DRILL_KEEP`        | Keep the scratch container for inspection. It holds production data.      |
| `POSTGRES_IMAGE`    | The scratch image. Defaults to `postgres:17-alpine`, matching production. |
| `DRILL_CONTAINER`   | Name for the scratch container.                                           |
| `WORK_DIR`          | Scratch directory for the dumped counts. Wiped on exit.                   |

It handles both artifact formats (see [Format](#format)) without configuration:
`.gz` restores through `gunzip \| psql`, `.dmp` through `pg_restore`. For
inspecting a custom-format artifact by hand instead, `pg_restore --list` and
`pg_restore --no-owner --no-acl` are covered in `docs/db/production-dump.md`.

Reading the result:

- **Row counts match exactly** — the strongest outcome, and what #267 step 7
  asks for. Expect it when nothing has been written since the backup ran.
- **Some table restored fewer rows than live** — a failure by default. Rows
  written after the backup are legitimate drift, but they look exactly like
  rows a partial restore lost, so the drill will not call that a pass on its
  own. Re-run against a quiet database, or set `ALLOW_DRIFT=1` once you have
  read the diff and recognised the tables as ones that take writes.
- **Some table restored _more_ rows than live** — always a failure. The backup
  was taken before now, so this cannot be drift.
- **A table present live is missing from the restore** — a failure. Compare the
  two journal watermarks the drill prints: if they are equal, the restore lost
  the table; if the restored watermark is older, the artifact simply predates
  the migration that added it.
- **Unexpected errors during the restore** — a failure. `already exists` noise
  from objects the fresh image ships with is filtered out; anything else is not.
  On the `.dmp` path a non-zero `pg_restore` exit is a failure in its own right.

To drill a B2 copy rather than a local one, download it first and pass
`BACKUP_FILE`.

The scratch container holds a full copy of production PII while it runs. It
publishes no port and is force-removed on exit unless `DRILL_KEEP` is set.

If you ever restore a `pg_dumpall` artifact by hand instead, note the hazard the
drill's throwaway container exists to avoid: the output carries its own
`\connect` directives, so review what it targets before running it against a
server that holds anything you care about.

Run this drill before every event, and as the one-time strict gate for #267
step 7. For the recurring check, see below — a drill that depends on someone
remembering to run it is not a control.

### Scheduled Database Restore Drill

The drill above needs a Docker socket and the local backup directory, so it only
runs on rylai by hand. `restore-drill-database-from-b2.sh` is the automated
sibling that needs neither: it pulls the newest artifact from B2, restores it
into a **scratch database on the live Postgres server**, compares per-table row
counts and the journal against live, and drops the scratch database.

```sh
pnpm restore:db:drill:b2

# in a scheduled task, without pnpm on PATH
sh scripts/restore-drill-database-from-b2.sh
```

It runs from the **application** container, which already has `awscli` and
`postgresql-client-17` in its image and reaches Postgres over `DATABASE_URL`.

**Why the application resource and not the database resource.** Coolify's
scheduled tasks attach only to applications and services: `scheduled_tasks` has
`application_id` and `service_id` and no column for a standalone database,
`ScheduledTaskJob` is typed to those two, and the database UI has no Scheduled
Tasks tab or route. (`ScheduledTask/Add.php` contains a `standalone-postgresql`
branch — it is dead code that writes to a column that does not exist.) So
scheduling this on the Postgres resource is not an option, however sensible it
sounds.

**What it trades away.** The restore lands on the production Postgres server
rather than an isolated container, so it shares that server's disk, CPU and
connection slots. That is acceptable while the dump is around 100 KB; revisit if
the database grows by orders of magnitude. It is also why the script refuses to
run when `SCRATCH_DB` and the live database name match, and why the scratch
database — which holds a full copy of production PII while the drill runs — is
dropped on exit unless `DRILL_KEEP` is set.

It requires a **custom-format** artifact. Gzipped `pg_dumpall` output is refused
rather than restored, because its `\connect` directives repoint the session
mid-stream and that is exactly what must not happen on a live server. Use the
container drill on rylai for artifacts predating the format change.

| Variable                | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `COOLIFY_BACKUP_BUCKET` | Bucket Coolify writes backups to. Defaults to `enescena-db-backups`.         |
| `BACKUP_KEY`            | Drill a specific S3 key instead of the newest artifact.                      |
| `BACKUP_FILE`           | Drill a local artifact and skip B2 entirely. No credentials needed.          |
| `SCRATCH_DB`            | Scratch database name. Defaults to `enescena_restore_drill`.                 |
| `TARGET_DB`             | The live database to compare against. Defaults to the one in `DATABASE_URL`. |
| `DRILL_KEEP`            | Keep the scratch database for inspection. It holds production data.          |
| `WORK_DIR`              | Scratch directory for the artifact and counts. Wiped on exit.                |

Unlike the container drill, a table that restored **fewer** rows than live is
reported and passes: on a schedule the database is never quiet, so drift is the
normal case and failing on it would train everyone to ignore the alert. It still
fails on a non-zero `pg_restore` exit, unexpected restore errors, zero tables, a
table missing from the restore, and counts _higher_ than live. The container
drill remains the strict check.

Set it up as a Coolify Scheduled Task on the **application** resource:

- Command: `sh scripts/restore-drill-database-from-b2.sh` (never `pnpm` — see
  the Daily Schedule note above).
- Frequency: `30 4 * * 1`, weekly, shortly after the 04:00 UTC backup.
- Timeout: comfortably above a full restore; 600 is ample at this size.

Coolify turns the non-zero exit into a `TaskFailed` notification, but only after
it exhausts three attempts (30s/60s/120s backoff), so expect the alert a few
minutes late. The per-channel `scheduled_task_failure` toggles default to on, so
what actually has to be configured is a notification transport on the team —
without one the task fails silently.

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
