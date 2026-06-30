# Production Database Dump

Use this runbook when local development needs a fresh copy of the production
application data from Supabase Postgres.

For the normal workflow, run:

```sh
pnpm db:refresh:prod
```

The script prompts for the production Postgres URL, creates a temporary dump,
replaces the local `en-escena` database, runs `pnpm db:push`, verifies basic
row counts, and removes the temporary dump. Pass `-- --keep-dump` when you need
to inspect the dump after the restore.

The manual commands below are kept as a fallback and as documentation of what
the script does.

The production connection string is a secret. Do not commit it to `.env`,
documentation, shell history, or dump files. Prefer pasting it only for the
current shell session:

```sh
read -rsp "Production DATABASE_URL: " PROD_DATABASE_URL
echo
export PROD_DATABASE_URL
```

Use the Supabase dashboard Postgres connection string, not `SUPABASE_URL`. The
direct connection or session pooler is the best fit for `pg_dump`. Avoid the
transaction pooler for dumps.

For the opposite direction, applying the local Drizzle schema to production,
use [Production Schema Push](production-schema-push.md).

## Create a Dump

Create dumps in the workspace under `tmp/db-dumps/`, which is ignored by git.
Do not save dumps inside the Postgres container; container-local files are easy
to miss and can be mistaken for current data later.

```sh
mkdir -p tmp/db-dumps

DUMP_PATH="tmp/db-dumps/en-escena-prod-$(date -u +%Y%m%d-%H%M%S).dump"

docker run --rm \
  -e PROD_DATABASE_URL \
  -e DUMP_FILE="$(basename "$DUMP_PATH")" \
  -v "$PWD/tmp/db-dumps:/dumps" \
  postgres:17-alpine \
  sh -lc 'pg_dump --format=custom --no-owner --no-acl --schema=public "$PROD_DATABASE_URL" --file="/dumps/$DUMP_FILE"'
```

Validate the archive before restoring it:

```sh
docker run --rm \
  -v "$PWD/tmp/db-dumps:/dumps" \
  postgres:17-alpine \
  pg_restore --list "/dumps/$(basename "$DUMP_PATH")" | head -40
```

The dump should list `public` schema objects such as `en_escena_academy`,
`en_escena_user`, and `en_escena_event`.

## Restore Locally

This replaces the local `en-escena` database in the Docker Compose Postgres
service. It does not touch `en-escena-test`.

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

After restoring, align the restored schema with the current Drizzle schema:

```sh
pnpm db:push
```

## Verify

Run a small sanity query against the local database:

```sh
docker exec en-escena-postgres psql -U postgres -d en-escena -c "
select 'academies' as table_name, count(*) from en_escena_academy
union all select 'users', count(*) from en_escena_user
union all select 'events', count(*) from en_escena_event
union all select 'choreographies', count(*) from en_escena_choreography
order by table_name;
"
```

Keep the dump only as long as needed. When finished:

```sh
rm -f "$DUMP_PATH"
```
