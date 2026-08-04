# Database Migrations

Drizzle is the single source of truth for the schema. Migrations are versioned
SQL files in `app/db/migrations/`, generated from `app/db/schema.ts`. There is
no `drizzle-kit push` and no Supabase SQL migration path anymore.

Two runners apply them, and the split matters:

- **Dev, test and CI** use `pnpm db:migrate` (drizzle-kit) against a database
  you can reach.
- **Production** applies them from the container entrypoint, before the app
  serves. The production Postgres is `is_public: false` with no published port,
  so there is no route from a laptop. See
  [Production migrations](#production-migrations).

`scripts/migrations/journal.db.test.ts` pins that the two runners agree on what
counts as applied.

## Everyday flow

1. Change the Drizzle schema in `app/db/schema/*`.
2. Generate a migration:

   ```sh
   pnpm db:generate
   ```

   This writes `NNNN_<name>.sql` plus `meta/` into `app/db/migrations/`. Review
   the SQL and commit it with the schema change.

3. Apply pending migrations to your local database:

   ```sh
   pnpm db:migrate
   ```

   `db:migrate` reads `DATABASE_URL` (loaded from `.env` locally). It is the
   local and dev command; it has no route to production.

4. Merge. Production applies the migration on the next deploy, from the
   entrypoint.

**Always rebase before generating.** `pnpm db:generate` timestamps a migration
with the current clock, and Drizzle applies migrations by high-water mark: a
migration whose timestamp predates one already applied is skipped permanently
and silently. The `migration-order` step in the `checks` CI job fails a PR whose
newest migration predates the newest on `master`; the fix is a rebase plus a
regenerate.

Test harnesses apply the exact same migrations: the PGlite snapshot builder and
`pnpm db:test:reset` both run `migrate` against `app/db/migrations`. `pushSchema`
survives only as the equivalence oracle in `app/db/migrations.db.test.ts`, which
asserts that `migrate` and `pushSchema` produce the same tables.

## The baseline

`0000_baseline_production_schema.sql` captures the entire production schema as
the first migration. It exists because production was built with the old
hand-written Supabase SQL migrations; the baseline lets Drizzle take over
without recreating the schema on a live database.

`pnpm db:baseline` registers the baseline as already applied in
`drizzle.__drizzle_migrations` **without running its DDL**. It is metadata-only
and reversible: dropping the `drizzle` schema undoes it. It matches the hash and
`created_at` that `drizzle-kit migrate` would record, so a later `db:migrate`
skips the baseline and applies only newer migrations.

Run `db:baseline` on any database whose schema already exists but that Drizzle
has not tracked yet:

- The production cutover (once, on the real database).
- After `pnpm db:refresh:prod`, which restores a prod dump (schema only, no
  migration state) and then calls `db:baseline` automatically.

## Zero-diff gate (baseline correctness)

The baseline must reproduce production exactly. To verify against a real clone:

```sh
pnpm db:refresh:prod   # clone prod into local; also runs db:baseline
pnpm db:generate       # must report "No schema changes"
```

If `db:generate` produces a migration, `app/db/schema.ts` has drifted from
production. Fix the drift **in the schema**, regenerate the baseline, and repeat
— never hand-patch the baseline SQL.

## Production migrations

The application container migrates itself at start, through
`scripts/docker-entrypoint.sh` → `scripts/migrate.mjs`, before handing over to
the server command. Nothing is applied from a laptop: the Coolify Postgres is
`is_public: false` with no published port.

`scripts/migrate.mjs` is plain `.mjs` because `tsx` and `drizzle-kit` are
devDependencies stripped by `pnpm prune --prod`, while `drizzle-orm` and
`postgres` are production dependencies. It:

1. **Waits for the database, but only for the database.** The app and Postgres
   are co-located containers with no start ordering, so a refused connection
   after a host reboot is expected; it retries for ~45s. Every failure after the
   database answers is deterministic and fatal — no retry, non-zero exit, the
   container does not serve.
2. **Takes a blocking advisory lock.** Drizzle reads the watermark _outside_ the
   transaction it then migrates in, so two overlapping container starts would
   both act on the same stale read. Blocking rather than `pg_try_*` so a second
   starter waits and then correctly no-ops.
3. **Pre-flights the journal.** Every journal entry at or below the applied
   watermark must have a matching row in `drizzle.__drizzle_migrations`, on both
   hash and timestamp. This catches the out-of-order merge (a migration Drizzle
   will skip forever) and a `.sql` file edited after being applied, neither of
   which Drizzle reports.
4. Applies pending migrations and exits.

A failed migration therefore shows up as a container that will not start, not as
a half-migrated schema. Roll back to the previous image from Coolify's Rollback
tab.

### Coolify settings this depends on

The entrypoint runs before the server command, so the container is unreachable
for as long as the migration plus the connection-retry budget takes. The
healthcheck has to allow for that:

| Setting                     | Value              | Why                                              |
| --------------------------- | ------------------ | ------------------------------------------------ |
| `health_check_path`         | `/internal/health` | Plain 200, no database — see below               |
| `health_check_return_code`  | `200`              | `/` always redirects, so it could never pass     |
| `health_check_enabled`      | `true`             | Was `false`, almost certainly because of the `/` |
| `health_check_start_period` | `~60s`             | Must cover the migration plus the ~45s retries   |

`/internal/health` must not query Postgres. Migration success already gates
start-up, so the healthcheck's only job is "did the process come up". A
DB-touching check would mark a healthy container unhealthy during a blip and
restart it, reintroducing the crash-loop the retry budget exists to prevent.

**Container command precedence.** The Coolify application has `start_command`
populated with the server command, byte-identical to the image's `CMD`. That is
why migrations hang off `ENTRYPOINT`: an `ENTRYPOINT` composes with whatever
command arrives, whereas a chained `CMD` would be silently overridden and the
migrations would never run — with no error, because the app would start
normally. Whether Coolify actually passes `start_command` as the container
command is _not yet confirmed against production_ (#593); record the answer here
after the first deploy. The design is correct either way.

### Break-glass

When you need to run something against production by hand, get a shell on the
server rather than a route to the port:

```sh
ssh rylai
docker exec -it <app-container> node /app/scripts/migrate.mjs   # re-run migrations
docker exec -it <postgres-container> psql -U postgres -d enescena
```

An SSH tunnel to `rylai` still works for ad-hoc `psql`, but it is no longer the
migration path.

### The cutover (historical)

Applied inside Fase 0, decoupled from the hosting migration:

1. Back up production.
2. Run `pnpm db:baseline` against the real production `DATABASE_URL`
   (metadata-only; no DDL runs).
3. From then on, schema changes ship as generated migrations.

The old `supabase_migrations.schema_migrations` history is abandoned in place;
nothing reads it anymore.

## Notes

- Once post-baseline migrations exist and are deployed to production, the
  `db:baseline` step inside `db:refresh:prod` will need to mark every migration
  applied through HEAD, not just the baseline — otherwise `db:migrate` would try
  to re-apply migrations already present in the restored dump.
- A CI drift-check (fails when `db:generate` produces an uncommitted migration)
  runs in the `checks` job of `.github/workflows/ci.yml`. `db:generate` is
  offline — it diffs `schema.ts` against `app/db/migrations/meta/` without a
  database — so it needs no Postgres service. Decided in #305; deferred here
  from the Fase 0 baseline (#391).
