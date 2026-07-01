# Production Schema Migrations

Production schema changes use Supabase CLI migrations in
`supabase/migrations/*.sql`.

Do not apply Drizzle's declarative schema directly to production. Drizzle remains
the application data access layer and typed schema for app code, but production
DDL is reviewed and applied as versioned SQL migrations.

## Current Baseline

The production `public` schema was baselined from project
`bcfxnroogbbochhruyda` into:

```text
supabase/migrations/20260701035459_baseline_production_schema.sql
```

That baseline version is marked as applied in the linked production project's
migration history, so future pushes should only apply newer migration files.

The legacy `en_escena_academy_registration_token` table is not present in this
baseline.

## Link The Project

On a fresh checkout or machine, link the repo before running linked production
commands:

```sh
pnpm exec supabase link --project-ref bcfxnroogbbochhruyda
```

The Supabase CLI stores local link metadata under `supabase/.temp/`, which is
ignored by git. Do not commit database passwords, access tokens, URLs with
passwords, or generated temp files.

If a linked command cannot authenticate to the database, set the production
database password for that command:

```sh
SUPABASE_DB_PASSWORD="..." pnpm db:migration:dry-run
```

## Create A Migration

Create a timestamped SQL file through the CLI:

```sh
pnpm db:migration:new <descriptive_name>
```

Edit the generated SQL manually. For every migration that changes app-owned
tables, update `app/db/schema/*` in the same changeset so Drizzle's typed schema
continues to match production.

## Review Before Applying

Run these commands before applying a production migration:

```sh
pnpm db:migration:dry-run
pnpm db:migration:advisors
```

Review the SQL that would run and any advisor findings. Fix relevant security or
performance issues before applying the migration.

## Apply

After review:

```sh
pnpm db:migration:push
```

Smoke-test the deployed application path that depends on the schema change.
When the change is risky, also refresh a local copy of production data and
verify the relevant flow against it:

```sh
pnpm db:refresh:prod
pnpm dev
```

## Drizzle Role

Use `pnpm db:push` only for local development databases. The command refuses to
run unless `DATABASE_URL` points at `localhost`, `127.0.0.1`, or `::1`.

Do not point `.env` at production to run `pnpm db:push`.

The old `pnpm db:push:prod` path is intentionally blocked. It exists only to
fail with instructions for this migration workflow.
