# Test-first notes: code that reaches the database

What the shared `tdd` skill needs to know about this stack when a change touches code that
reads or writes the database.

- **The seam is the service or the route.** Call the service function, or the route's loader or
  action, against a real in-memory database and assert on the result: never on the SQL it
  builds or on intermediate state. The DB suite runs on PGlite, in process
  (`pnpm test:db <path>`), with the isolation model of
  [ADR-0007](../adr/0007-db-test-isolation-model.md); `pnpm test:db:postgres` runs the same files
  on real Postgres, which CI's `db-gate` uses.
- **A DB test file** ends in `.db.test.ts`. Its fixtures are the `*.test-support.ts` beside the
  domain or the modules under `app/lib/test-support/`
  ([coding-standards.md](coding-standards.md#test-support-files)); extend one before adding one.
- **What TypeScript and the schema already prove** (a return shape, a required column, a
  foreign key) needs no test. Spend tests on ordering, sums and rounding, the rows after a
  mutation, conflicts, and the edge cases of the domain rule.
- **Shared test infrastructure** (`tests/db/`, a `*.test-support.ts`, the schema or a migration):
  run the whole `pnpm test:db`, not just the touched file
  ([validation.md](validation.md#targeting-db-tests)).
- **A migration** comes from `pnpm db:generate`, never by hand
  ([migrations.md](../db/migrations.md#everyday-flow)).
