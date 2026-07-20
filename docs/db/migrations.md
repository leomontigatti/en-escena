# Database Migrations

Drizzle is the single source of truth for the schema. Migrations are versioned
SQL files in `app/db/migrations/`, generated from `app/db/schema.ts` and applied
with the same command in dev, test, CI, and production. There is no `drizzle-kit
push` and no Supabase SQL migration path anymore.

## Everyday flow

1. Change the Drizzle schema in `app/db/schema/*`.
2. Generate a migration:

   ```sh
   pnpm db:generate
   ```

   This writes `NNNN_<name>.sql` plus `meta/` into `app/db/migrations/`. Review
   the SQL and commit it with the schema change.

3. Apply pending migrations to the target database:

   ```sh
   pnpm db:migrate
   ```

   `db:migrate` reads `DATABASE_URL` (loaded from `.env` locally). The same
   command runs in dev, test, CI, and production — only the connection differs.

Test harnesses apply the exact same migrations: the PGlite snapshot builder and
`pnpm db:test:push` both run `migrate` against `app/db/migrations`. `pushSchema`
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

## Production cutover (once)

Applied inside Fase 0, decoupled from the hosting migration:

1. Back up production.
2. Run `pnpm db:baseline` against the real production `DATABASE_URL`
   (metadata-only; no DDL runs).
3. From then on, schema changes ship as generated migrations applied with
   `pnpm db:migrate`.

The old `supabase_migrations.schema_migrations` history is abandoned in place;
nothing reads it anymore.

## Notes

- Once post-baseline migrations exist and are deployed to production, the
  `db:baseline` step inside `db:refresh:prod` will need to mark every migration
  applied through HEAD, not just the baseline — otherwise `db:migrate` would try
  to re-apply migrations already present in the restored dump.
- A CI drift-check (fails when `db:generate` produces an uncommitted migration)
  is tracked separately in issue #305.
