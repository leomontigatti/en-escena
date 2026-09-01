# PGlite POC for DB tests

This pilot exercises `PGlite` against the current En Escena schema using the
same schema source the DB tests use today (`app/db/schema.ts`).

## Pilot scope

- Pilot file: `tests/db/pglite.db.test.ts`
- In-process helper: `tests/db/pglite.ts`
- Schema bootstrap: `tests/db/migrate-pglite-schema.ts` (applies
  `app/db/migrations` through `migrate`; `tests/db/push-pglite-schema.ts`
  survives as the `pushSchema` oracle for the equivalence test)
- Preserved Postgres workflow: `pnpm test:db` and
  `pnpm test:db:file:postgres <file>`

The pilot validates these capabilities against an in-process database isolated
in a temporary directory:

- harness-style reset with `truncate ... restart identity cascade`
- enums
- foreign keys
- partial/unique constraints
- transactions with rollback
- `jsonb` defaults
- SQL patterns the repo already uses (`ilike`, `lower`, `coalesce`)

## Result

The pilot found no functional incompatibilities for the capabilities listed
above. The schema applies and the queries exercised behave the way the app
expects.

## Incompatibilities and differences found

1. `drizzle-kit/api` does not load reliably inside Vitest's transformation
   pipeline for this repo.
   Impact: `pushSchema` runs from a separate Node script
   (`tests/db/push-pglite-schema.ts`, today only the equivalence oracle)
   instead of being imported directly from the test or from a Vitest
   `globalSetup` without extra tweaking.

2. PGlite driver errors do not have the same shape as the errors the current
   `postgres` harness produces.
   Impact: constraint metadata ends up in `error.cause.code` and
   `error.cause.constraint`, not in top-level properties such as
   `constraint_name`. Any app or test logic that depends on the exact shape of
   a Postgres.js error needs an adaptation layer before PGlite can be a drop-in
   replacement.

## Operational reading

- As a POC, PGlite is faithful enough to keep evaluating a faster harness with
  an in-process schema.
- In the current workflow, PGlite is the default route for the full DB suite
  with `pnpm test:db` (part of `pnpm test`), and for focused runs with
  `pnpm test:db <file>`. Real Postgres remains the high-fidelity route in
  `pnpm test:db:postgres`, reserved for the CI gate (#305).
- It is still not a transparent replacement for the current stack, because the
  schema bootstrap, the error shape compatibility and initialization stability
  in parallel mode would all still need to be resolved.
