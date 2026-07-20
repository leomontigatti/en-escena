# Package Scripts

This document lists the repo-level `pnpm` scripts and points to the runbook to
use when a script has operational risk.

## Development

| Script       | Purpose                                         |
| ------------ | ----------------------------------------------- |
| `pnpm dev`   | Start the React Router development server.      |
| `pnpm build` | Build the app for production.                   |
| `pnpm start` | Serve the built app with `@react-router/serve`. |

## Validation

| Script                   | Purpose                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm format`            | Format the repo with Prettier. Changes files in place.                                               |
| `pnpm format:check`      | Check Prettier formatting without changing files.                                                    |
| `pnpm check:repo-styles` | Enforce app UI style guardrails.                                                                     |
| `pnpm check:file-tokens` | Check staged application source file size before commit or PR handoff.                               |
| `pnpm typecheck`         | Generate React Router route types and run TypeScript. Use this instead of `pnpm exec tsc`.           |
| `pnpm test`              | Run the full pre-commit suite: unit/react plus the DB suite on in-process PGlite. No local Postgres. |
| `pnpm test:unit`         | Run only the non-database (unit/react) Vitest suite.                                                 |
| `pnpm test:watch`        | Run Vitest in watch mode.                                                                            |

## Database

| Script                 | Purpose                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`     | Generate a versioned SQL migration in `app/db/migrations` from the Drizzle schema. See [Database Migrations](../db/migrations.md).          |
| `pnpm db:migrate`      | Apply pending migrations to `DATABASE_URL` (same command in dev, test, CI, and prod).                                                       |
| `pnpm db:baseline`     | Register the baseline migration as applied on an existing database without running its DDL. See [Database Migrations](../db/migrations.md). |
| `pnpm db:refresh:prod` | Replace local `en-escena` with a fresh production dump. See [Production Database Dump](../db/production-dump.md).                           |
| `pnpm db:test:push`    | Reset and migrate the schema on `TEST_DATABASE_URL` for Postgres-backed DB tests.                                                           |
| `pnpm db:studio`       | Open Drizzle Studio using `.env`.                                                                                                           |

## Database Tests

| Script                            | Purpose                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:db`                    | Run the full DB suite on the in-process PGlite harness. No local Postgres. Included in `pnpm test`.                              |
| `pnpm test:db <archivo>`          | Run one focused DB test file on the PGlite harness.                                                                              |
| `pnpm test:db:postgres`           | Push schema to `TEST_DATABASE_URL` and run the DB Vitest suite against real Postgres. Reserved for the CI gate on the PR (#305). |
| `pnpm test:db:postgres <archivo>` | Run one focused DB test file against real Postgres.                                                                              |

## Backups

| Script                   | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `pnpm backup:db:b2`      | Create a production PostgreSQL dump and upload it to Backblaze B2. See [Backups](backups.md). |
| `pnpm backup:storage:b2` | Copy configured Supabase Storage buckets to Backblaze B2. See [Backups](backups.md).          |

## Git Hooks

| Script         | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `pnpm prepare` | Install Husky hooks after dependency installation. |
