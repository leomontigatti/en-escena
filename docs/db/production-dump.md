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

At a terminal it asks for confirmation — type `en-escena` — because there the
command may be a slip. Run non-interactively (an agent, a script, a piped shell)
it goes ahead without asking: the request was already explicit, and there is
nobody to answer a prompt. No flag is needed either way. `en-escena-test` is
never touched.

## Choosing which dump

| Variable        | Purpose                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `BACKUP_ON`     | Restore the newest artifact written on a given day, `YYYY-MM-DD`, by mtime in the server's time zone. |
| `BACKUP_FILE`   | Restore one named artifact: an absolute path on the remote host, or a dump already on this machine.   |
| `PROD_SSH_HOST` | The SSH host to fetch from. Defaults to `rylai`.                                                      |
| `BACKUP_DIR`    | Where to search on that host. Defaults to `/data/coolify/backups/databases`.                          |

With none of them set, the newest artifact there is wins.

```sh
BACKUP_ON=2026-09-12 pnpm db:refresh:prod
```

When no artifact was written that day, the error lists the days that do have
one, so a second guess needs no digging around on the server. Retention is 7
days of artifacts on the VPS; older days are gone unless the dump is still
somewhere on this machine.

A `BACKUP_FILE` that exists locally is restored where it lies — no `scp`, no
second copy of production data on the disk, and the file is left in place
afterwards whether or not `--keep-dump` was passed. This is how a dump kept from
an earlier run gets reused:

```sh
BACKUP_FILE=tmp/db-dumps/pg-dump-enescena-1785985203.dmp pnpm db:refresh:prod
```

A path that does **not** exist locally is treated as a remote one and fetched.

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

The overrides that pick a different one are in
[Choosing which dump](#choosing-which-dump) above.

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

docker cp "$DUMP_PATH" en-escena-postgres:/tmp/en-escena-prod.dump
docker exec en-escena-postgres pg_restore --exit-on-error --no-owner --no-acl -U postgres -d en-escena /tmp/en-escena-prod.dump
docker exec en-escena-postgres rm -f /tmp/en-escena-prod.dump
```

**Do not drop the `public` schema** that `createdb` just made. A
whole-database dump does not recreate it — only non-default schemas like
`drizzle` carry a `CREATE SCHEMA` — so dropping it makes every `public` object
fail with "schema public does not exist", while `drizzle` restores cleanly and
leaves a plausible-looking journal on an otherwise empty database.

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

The count must match the number of entries in
`app/db/migrations/meta/_journal.json`; a single row means someone baselined on
top of the restore. Then confirm nothing is left to apply — this must report no
applied migration:

```sh
pnpm db:migrate
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
