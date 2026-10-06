# Package Scripts

Every repo-level `pnpm` script, with a link to its runbook where it has one.
This list is complete: a command that is not here is not a script of this repo.

Rows marked **⚠️** reach outside the repo — a remote host, the production
server, a backup bucket, or the local database — or destroy local state. Read
the linked runbook before running one. Everything unmarked is safe to run at
any time: it reads the working tree and writes nothing but its own output.

## Development

| Script          | Purpose                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`      | Start the React Router development server on `.env.local`'s `PORT`, first creating the worktree's database if it has none; fails if the port is taken.                                                                                                            |
| `pnpm dev:stop` | Stop this worktree's dev server: the process listening on `.env.local`'s `PORT` that runs from inside the worktree. Prints `stopped <pid> on <port>` or `nothing listening on <port>`; a listener from another directory is left alone and reported, with exit 1. |
| `pnpm build`    | Build the app for production.                                                                                                                                                                                                                                     |
| `pnpm start`    | Serve the built app with `@react-router/serve`.                                                                                                                                                                                                                   |

## Validation

None of these reach outside the repo; only `pnpm format` writes to it. The
recommended order for a final pass is in
[Workflows](../agents/workflows.md#command-guardrail).

| Script                              | Purpose                                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format`                       | Format the repo with Prettier. Changes files in place.                                                                                                                                                                       |
| `pnpm format:check`                 | Check Prettier formatting without changing files.                                                                                                                                                                            |
| `pnpm lint`                         | Run oxlint over what `.oxlintrc.json` enables: React hook mistakes, import cycles, un-awaited promises, and the `ui` rules against raw form elements and restyled ui components. Not a formatter — formatting is Prettier's. |
| `pnpm typecheck`                    | Generate React Router route types and run TypeScript. Use this instead of `pnpm exec tsc`.                                                                                                                                   |
| `pnpm test`                         | Run the full pre-commit suite: unit/react plus the DB suite on in-process PGlite. No local Postgres.                                                                                                                         |
| `pnpm test:unit`                    | Run only the non-database (unit/react) Vitest suite.                                                                                                                                                                         |
| `pnpm test:watch`                   | Run Vitest in watch mode. Stays up until you quit it.                                                                                                                                                                        |
| `pnpm check:repo-styles`            | Enforce app UI style guardrails.                                                                                                                                                                                             |
| `pnpm check:file-tokens`            | Check staged application source file size before commit or PR handoff.                                                                                                                                                       |
| `pnpm check:comment-language`       | Fail on Spanish in engineering prose — comments and test names. See [Coding Standards](../agents/coding-standards.md). Runs in the pre-commit hook.                                                                          |
| `pnpm check:banned-imports`         | Fail when a retired dependency is imported again. The reason each one was retired travels with the rule and is printed at the failure.                                                                                       |
| `pnpm check:labels`                 | Fail when a workflow, Sandcastle runner, script or local skill names a label that `.github/labels.json` does not hold. See [Triage labels](../agents/triage-labels.md).                                                      |
| `pnpm check:fallow`                 | The commit gate: fail on code left unreachable by the branch. See [Fallow](../agents/fallow.md). Runs in the pre-commit hook.                                                                                                |
| `pnpm check:doc-map`                | Fail when mapped code changed without its current-state document (`app/lib/shared/doc-map.json`). Runs in CI as `docs-gate`; needs `origin/master` fetched.                                                                  |
| `pnpm check:pr-title`               | Fail a PR title that lacks a conventional prefix or whose subject is not English. The title is the subject line squash-merge lands on `master`.                                                                              |
| `pnpm check:dependency-audit`       | Fail a branch on the high and critical advisories it _introduces_, by auditing its tree against the base ref's. Runs in CI; needs `origin/master` fetched.                                                                   |
| `pnpm check:migration-order`        | Fail when a new migration predates the newest one on `master`. Runs in CI; needs `origin/master` fetched.                                                                                                                    |
| `pnpm check:migration-immutability` | Fail when an already-applied migration or its journal entry was edited. See [Database Migrations](../db/migrations.md).                                                                                                      |
| `pnpm check:migration-safety`       | Lint the migrations a branch _adds_ with squawk, splitting blocking findings from advisory ones. See [Database Migrations](../db/migrations.md).                                                                             |

## Database

| Script                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`        | Generate a versioned SQL migration in `app/db/migrations` from the Drizzle schema. See [Database Migrations](../db/migrations.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ⚠️ `pnpm db:migrate`      | Apply pending migrations to `DATABASE_URL`. Local and dev only — production migrates from the container entrypoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ⚠️ `pnpm db:baseline`     | Register the baseline migration as applied on an existing database without running its DDL. See [Database Migrations](../db/migrations.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ⚠️ `pnpm db:refresh:prod` | Replace the local database `DATABASE_URL` names (the worktree's own, or `en-escena` in the main checkout) with a Coolify backup artifact, by default the newest on `rylai`. `BACKUP_ON=YYYY-MM-DD` picks a day, `BACKUP_FILE` a single artifact (remote path, or a dump already on this machine). Never touches the live database. Confirms only at a terminal. See [Production Database Dump](../db/production-dump.md).                                                                                                                                                                                                                                                                                                                                                                                                 |
| ⚠️ `pnpm db:seed`         | Reset the demo data on the local `DATABASE_URL` (the worktree's own when `.env.local` exists): an admin (`admin@enescena.local`), an academy (`academia@enescena.local`, `Academia Demo`) and a second one with no province or city (`academia.antigua@`), an auditor and a judge (`auditoria@`, `jurado@`) sharing one printed password, three events (active, future, finished) with a registrable catalog on the active one, four dancers, two professors and four choreographies in different states (deposit paid, disqualified, scored and invoiced, unpaid), one payment, and one demo comprobante on sales point 9999. Deletes what hangs off those accounts and event names first, and deactivates any other active event. Refuses a non-local host. See [Local operation and auth](../local-auth.md#demo-data). |
| ⚠️ `pnpm db:worktree`     | Set up this worktree's own database (`en-escena-wt-<worktree>`, created, migrated, seeded once) and dev port in `.env.local`. `pnpm dev`, `db:seed` and `db:migrate` do it on first use; this re-runs it. Safe to re-run. See [Local operation and auth](../local-auth.md#one-database-per-worktree).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ⚠️ `pnpm db:test:reset`   | Reset and migrate the schema on `TEST_DATABASE_URL` — the separate `en-escena-test` database, not the development one — for Postgres-backed DB tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ⚠️ `pnpm db:studio`       | Open Drizzle Studio on the `DATABASE_URL` in effect (the worktree's own when `.env.local` exists, else `.env`'s): a browser over the local database that can edit rows. Stays up until you quit it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Database Tests

| Script                            | Purpose                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:db`                    | Run the full DB suite on the in-process PGlite harness. No local Postgres. Included in `pnpm test`.                                                              |
| `pnpm test:db <archivo>`          | Run one focused DB test file on the PGlite harness.                                                                                                              |
| `pnpm test:db:postgres`           | Push schema to `TEST_DATABASE_URL` and run the DB Vitest suite against real Postgres. The local high-fidelity path; CI runs the same suite sharded (#305, #962). |
| `pnpm test:db:postgres <archivo>` | Run one focused DB test file against real Postgres.                                                                                                              |

## Backups

| Script                          | Purpose                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ `pnpm backup:storage:b2`     | Back up the local storage volume (the live store) to Backblaze B2. See [Backups](backups.md).                                                                                  |
| ⚠️ `pnpm restore:storage:drill` | Restore the storage backup from B2 into a throwaway dir and verify it, without touching the live volume. See [Backups](backups.md).                                            |
| ⚠️ `pnpm restore:db:drill`      | Restore a Coolify database backup into a throwaway Postgres container and compare it against the live database. Runs on the server. See [Backups](backups.md).                 |
| ⚠️ `pnpm restore:db:drill:b2`   | Pull the newest database backup from B2 and restore it into a scratch database on the live server. Needs no Docker, so it runs as a scheduled task. See [Backups](backups.md). |

## Pruebas

| Script                  | Purpose                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `pnpm pruebas:reset` | Replace pruebas' database and storage with a copy of production as it is now, over SSH on `rylai`. Reads production, never writes it; stops and restarts the pruebas app. See [Pruebas](pruebas.md). |

## AFK Platform

The one remaining workflow (Architecture Review): see
[AFK setup](../agents/afk-setup.md) for the operational side and ADR-0016 for
why everything else moved to local sessions. Its runner is invoked by the
workflow, never by hand.

| Script                  | Purpose                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `pnpm setup:secrets` | Load the repo's GitHub Actions secrets through `gh`. Prompts for each value, so it needs a terminal. See [AFK setup](../agents/afk-setup.md). |

## Pull Requests

| Script                | Purpose                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `pnpm pr:evidence` | `pnpm pr:evidence <pr> <image>...` uploads screenshots or GIFs to the public `pr-assets` prerelease and prints the markdown to paste in the PR body. Publishes to a public repo: seed data only. See [Pull requests](../agents/pull-requests.md). |
| ⚠️ `pnpm pr:watch`    | `pnpm pr:watch [pr] [--once]` blocks until nothing on the PR's head commit is still running (checks, CodeRabbit), then prints one JSON verdict and exits with it as the code. Reads only. See the `babysit-pr` skill.                             |

## Labels

| Script                | Purpose                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `pnpm labels:sync` | Create or update the repo's GitHub labels from `.github/labels.json`. Never deletes: labels the file does not hold are listed and left alone. `--dry-run` prints the plan only. See [Triage labels](../agents/triage-labels.md). |

## Worktrees

| Script                   | Purpose                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ `pnpm worktree:sweep` | List the worktrees finished threads left (PR merged or closed, or never committed; nothing unsaved; nothing running inside) and the ones kept, with the reason. `--apply` removes what the last dry run listed, their branches and databases; `--keep <folder>` spares one. Run by the `housekeeping` skill. |

## Git Hooks

| Script         | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `pnpm prepare` | Install Husky hooks after dependency installation. |

## One-off SQL

Not `pnpm` scripts — `.sql` files under `scripts/`, run with `psql`. They are
read-only checks tied to a specific migration and are deleted once it has
shipped. There are none right now: `scripts/verify-555.sql` shipped with #632
and was deleted with the migration it guarded (#689).
