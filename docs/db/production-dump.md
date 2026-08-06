# Production Database Dump

Use this runbook when local development needs a fresh copy of the production
application data — reproducing a reported bug against the exact rows, or running
the [zero-diff gate](migrations.md#zero-diff-gate-baseline-correctness).

For the normal workflow, run:

```sh
pnpm db:refresh:prod
```

The script fetches the newest Coolify backup artifact from `rylai` over `scp`,
replaces the local `en-escena` database with it, prints the migration journal and
basic row counts, and removes the local copy. Pass `-- --keep-dump` when you need
to inspect the artifact after the restore.

The manual commands below are kept as a fallback and as documentation of what
the script does.

## Where the data comes from

There is no route from a laptop to the production database: it is
`is_public: false` with no published port (see
[Production infrastructure](../operations/infrastructure.md)). Nothing here
dumps a live database, and no production credentials are involved.

The source is the artifact Coolify's own scheduled backup already wrote on the
VPS, under `/data/coolify/backups/databases/<team>/<resource>/`, with 7-day local
retention. It is a custom-format `pg_dump` of the whole `enescena` database —
every schema, `public` and `drizzle` alike. See
[Backups](../operations/backups.md#database-backup-coolify-native).

Overrides, when the default is not what you want:

| Variable        | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `PROD_SSH_HOST` | The SSH host to fetch from. Defaults to `rylai`.                             |
| `BACKUP_DIR`    | Where to search on that host. Defaults to `/data/coolify/backups/databases`. |
| `BACKUP_FILE`   | Fetch a specific remote artifact instead of the newest one.                  |

Only custom-format (`.dmp`) artifacts are accepted. The gzipped `pg_dumpall`
files predating #594 are refused: `pg_restore` cannot read them, and their
`\connect` directives repoint the session mid-restore.

### When the nightly artifact is not fresh enough

If the bug was reported an hour ago and the row did not exist at backup time,
the scheduled artifact is not enough. In order of preference:

1. **Backup Now** on the Coolify Postgres resource, then re-run
   `pnpm db:refresh:prod`. No shell on the database at all.
2. `ssh rylai` and `docker exec` a `pg_dump` on the Postgres container, then pass
   the result through `BACKUP_FILE`.

## Prefer not to clone at all

The production database holds dancer personal documents and payment records.
Routinely materialising a full copy on a laptop is real exposure under Ley
25.326's minimisation principle. The full clone earns its keep for the
data-shape class of bug — a `comprobante` in an impossible state, an allocation
that does not balance — where no stack trace substitutes for the rows. It should
be the exception, not the first move on every report.

Keep the local copy only as long as needed. Dumps live under `tmp/db-dumps/`,
which is ignored by git.

## Fetch the artifact by hand

```sh
mkdir -p tmp/db-dumps

REMOTE_PATH="$(ssh rylai "find '/data/coolify/backups/databases' -type f -name 'pg-dump-*.dmp' -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-")"

DUMP_PATH="tmp/db-dumps/$(basename "$REMOTE_PATH")"

scp "rylai:$REMOTE_PATH" "$DUMP_PATH"
```

Validate the archive before restoring it:

```sh
docker run --rm \
  -v "$PWD/tmp/db-dumps:/dumps" \
  postgres:17-alpine \
  pg_restore --list "/dumps/$(basename "$DUMP_PATH")" | head -40
```

It should list `public` schema objects such as `en_escena_academy`,
`en_escena_user` and `en_escena_event`, and the `drizzle` schema alongside them.

## Restore Locally

This replaces the local `en-escena` database in the Docker Compose Postgres
service. It does not touch `en-escena-test`.

Keep the `postgres:17-alpine` pin on both sides: custom-format dumps are
sensitive to major-version skew, so the client must not be older than the server
that wrote the archive.

```sh
docker compose up -d postgres

docker exec en-escena-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'en-escena' and pid <> pg_backend_pid();"

docker exec en-escena-postgres dropdb -U postgres --if-exists en-escena
docker exec en-escena-postgres createdb -U postgres en-escena
docker exec en-escena-postgres psql -U postgres -d en-escena -v ON_ERROR_STOP=1 \
  -c "drop schema if exists public cascade;"

docker cp "$DUMP_PATH" en-escena-postgres:/tmp/en-escena-prod.dump
docker exec en-escena-postgres pg_restore --no-owner --no-acl -U postgres -d en-escena /tmp/en-escena-prod.dump
docker exec en-escena-postgres rm -f /tmp/en-escena-prod.dump
```

**Do not run `pnpm db:baseline` afterwards.** The artifact carries the `drizzle`
schema, so the migration journal arrives intact and complete. Baselining on top
would claim only the baseline had run and make the next `pnpm db:migrate`
re-apply every migration after it. See
[Database Migrations](migrations.md#the-baseline).

For production schema changes, use versioned Drizzle migrations. Production
applies them from the container entrypoint, not from a laptop; see
[Database Migrations](migrations.md).

## Verify

The journal should carry every migration, not just the baseline, and
`pnpm db:migrate` against the refreshed database should be a true no-op:

```sh
docker exec en-escena-postgres psql -U postgres -d en-escena -c "
select count(*) as migrations, max(created_at) as watermark from drizzle.__drizzle_migrations;
"
```

Then a small sanity query against the data:

```sh
docker exec en-escena-postgres psql -U postgres -d en-escena -c "
select 'academies' as table_name, count(*) from en_escena_academy
union all select 'users', count(*) from en_escena_user
union all select 'events', count(*) from en_escena_event
union all select 'choreographies', count(*) from en_escena_choreography
order by table_name;
"
```

When finished:

```sh
rm -f "$DUMP_PATH"
```
