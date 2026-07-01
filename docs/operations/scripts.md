# Package Scripts

This document lists the repo-level `pnpm` scripts and points to the runbook to
use when a script has operational risk.

## Development

| Script            | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `pnpm dev`        | Start the React Router development server.      |
| `pnpm build`      | Build the app for production.                   |
| `pnpm start`      | Serve the built app with `@react-router/serve`. |
| `pnpm sandcastle` | Run the Sandcastle workflow.                    |

## Validation

| Script                   | Purpose                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm format`            | Format the repo with Prettier. Changes files in place.                                     |
| `pnpm format:check`      | Check Prettier formatting without changing files.                                          |
| `pnpm check:repo-styles` | Enforce app UI style guardrails.                                                           |
| `pnpm check:file-tokens` | Check staged application source file size before commit or PR handoff.                     |
| `pnpm typecheck`         | Generate React Router route types and run TypeScript. Use this instead of `pnpm exec tsc`. |
| `pnpm test`              | Run the non-database Vitest suite.                                                         |
| `pnpm test:watch`        | Run Vitest in watch mode.                                                                  |

## Database

| Script                         | Purpose                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:push`                 | Push the Drizzle schema to a local `DATABASE_URL`; refuses non-local hosts.                                                      |
| `pnpm db:push:prod`            | Blocked guardrail for the old Drizzle production push path. See [Production Schema Migrations](../db/production-schema-push.md). |
| `pnpm db:migration:new <name>` | Create a timestamped Supabase SQL migration file.                                                                                |
| `pnpm db:migration:list`       | List local and linked production Supabase migrations.                                                                            |
| `pnpm db:migration:dry-run`    | Show linked production migrations that would be applied without applying them.                                                   |
| `pnpm db:migration:advisors`   | Run Supabase database advisors against the linked project.                                                                       |
| `pnpm db:migration:push`       | Apply pending Supabase SQL migrations to the linked project after review.                                                        |
| `pnpm db:refresh:prod`         | Replace local `en-escena` with a fresh production dump. See [Production Database Dump](../db/production-dump.md).                |
| `pnpm db:test:push`            | Reset and push the schema to `TEST_DATABASE_URL` for Postgres-backed DB tests.                                                   |
| `pnpm db:studio`               | Open Drizzle Studio using `.env`.                                                                                                |

## Database Tests

| Script                                 | Purpose                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm test:db:file <archivo>`          | Run focused DB tests with the fast PGlite harness.                                    |
| `pnpm test:db`                         | Run the final reliable DB suite. Alias of `pnpm test:db:final`.                       |
| `pnpm test:db:final`                   | Run the final reliable DB suite through Postgres. Alias of `pnpm test:db:postgres`.   |
| `pnpm test:db:postgres`                | Push schema to `TEST_DATABASE_URL` and run the DB Vitest suite serially.              |
| `pnpm test:db:file:final <archivo>`    | Run one focused DB test file through Postgres. Alias of `pnpm test:db:file:postgres`. |
| `pnpm test:db:file:postgres <archivo>` | Push schema to `TEST_DATABASE_URL` and run one focused DB test file through Postgres. |
| `pnpm test:db:fast:full`               | Run the full DB suite with the experimental PGlite path. Not the final signoff path.  |

## Backups

| Script                   | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `pnpm backup:db:b2`      | Create a production PostgreSQL dump and upload it to Backblaze B2. See [Backups](backups.md). |
| `pnpm backup:storage:b2` | Copy configured Supabase Storage buckets to Backblaze B2. See [Backups](backups.md).          |

## Git Hooks

| Script         | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `pnpm prepare` | Install Husky hooks after dependency installation. |
