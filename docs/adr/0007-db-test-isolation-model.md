# Decide fast DB test isolation around PGlite snapshots

**Status**: accepted

En Escena needs a faster DB feedback loop without losing confidence on rules
persisted in Postgres. The measured baseline from 2026-06-20 was:

- `npm run db:test:push`: 2.31s fixed cost before every DB run.
- `npm run test:db:file -- tests/db/harness.db.test.ts`: 4.90s wall clock.
- `npm run test:db`: 80.32s wall clock for 27 files and 238 passing tests.
- Existing DB failures at decision time: none. Issue `#123` revalidated the
  baseline and confirmed there were no preexisting DB failures to discount.

Issue `#127` then scaled the chosen model to the full DB suite with these
results on 2026-06-20:

- `npm run test:db`: 45.23s wall clock for 28 files and 241 passing tests.
- `npm run test:db:postgres`: 79.05s wall clock for the same 28 files and 241
  passing tests, including the schema push through `TEST_DATABASE_URL`.

Issue `#124` also completed a PGlite POC against the current schema. The pilot
found functional parity for the behaviors exercised in the repo today:

- schema application;
- `truncate ... restart identity cascade` resets;
- enums;
- foreign keys;
- unique and partial constraints;
- transactions with rollback;
- `jsonb` defaults;
- query patterns already used by the repo, including `ilike`, `lower` and
  `coalesce`.

The pilot also found two real integration gaps:

- schema bootstrap through `drizzle-kit/api` is not stable inside the current
  Vitest transform pipeline, so PGlite schema setup currently needs a separate
  Node bootstrap script;
- PGlite error objects expose constraint metadata on `error.cause`, not with
  the same top-level shape that `postgres` returns today.

**Considered Options**

- PGlite with schema snapshots: fastest-looking path based on the repo baseline
  and the successful POC, because it can remove the repeated 2.31s schema push
  cost from focused runs and avoid TCP Postgres setup during the fast path.
- Real Postgres per worker: highest fidelity to production semantics, but still
  requires `localhost:5433`, per-worker DB or schema templating, cleanup, and
  more operational complexity before it can improve the measured baseline.

**Decision Details**

En Escena adopts PGlite with schema snapshots as the default full DB test
isolation model.

Why this option won now:

- The current baseline has no preexisting DB failures, so the next change can
  be judged cleanly as a regression or improvement.
- The baseline shows a meaningful fixed setup tax before every DB run; PGlite
  snapshots directly target that cost.
- The PGlite POC already proved compatibility for the schema and SQL patterns
  En Escena depends on today.
- Real Postgres per worker remains plausible, but it adds more moving parts
  before it removes any measured cost in this repo.

This decision does not delete the real Postgres harness. The default
`npm run test:db` path now uses the worker-local PGlite snapshot harness for
fast feedback, while `npm run test:db:postgres` preserves the high-fidelity
validation path through `TEST_DATABASE_URL`.

**Fidelity Risks**

- `Evento`: active-event uniqueness, registration windows, and lifecycle rules
  rely on DB constraints and date logic covered by
  `app/lib/events/management.server.db.test.ts`. Any divergence in constraint
  enforcement or timestamp semantics must block broader rollout.
- `Academia`: registration and academy-owned data flows depend on user/session
  creation and uniqueness behavior covered by
  `app/lib/academies/registration.server.db.test.ts` and
  `app/lib/portal/route.server.db.test.ts`.
- `Coreografia`: choreography registration, ownership, and active-event scoping
  use dense event-scoped joins and transactional writes covered by
  `app/lib/portal/choreographies.server.db.test.ts`,
  `app/lib/choreographies/registration-confirmation.server.db.test.ts`, and
  `app/lib/choreographies/registration-resolution.server.db.test.ts`.
- `Usuario`: internal user lifecycle, invitation, audit, and suspension flows
  depend on auth-adjacent persistence behavior covered by
  `app/lib/admin/users/*.db.test.ts`.
- `Sesion de acceso`: login, revocation, inactivity policy, logout, and
  recovery flows depend on auth/session persistence and are covered by
  `app/lib/auth/*.db.test.ts`. Error-shape differences are especially relevant
  here because auth flows may surface DB failures differently.
- `Bases del evento`: event-scoped uniqueness, labels, and readiness inputs are
  covered by `app/lib/events/bases-repository.server.db.test.ts`,
  `app/lib/admin/events/bases-route.server.db.test.ts`, and
  `app/lib/events/registration-readiness.server.db.test.ts`.

**Fallback path**

If PGlite snapshots fail later because of incompatible query semantics, an
unacceptable error-shape adapter burden, unstable schema bootstrap, or a
surface-specific regression in Evento, Academia, Coreografia, Usuario, Sesion
de acceso, or Bases del evento, the fallback is real Postgres per worker:

1. Keep `npm run test:db:postgres` on real Postgres as the final confidence
   path.
2. Build a template DB or schema once per run with the current Drizzle schema.
3. Provision one isolated DB or schema per Vitest worker using
   `VITEST_POOL_ID`.
4. Point each worker to its isolated Postgres target before importing `@/db`.
5. Only enable parallel DB workers after repeated runs prove isolation.

**Consequences**

- The full DB suite now runs on PGlite snapshots by default with file
  parallelism enabled and worker-local in-memory state.
- Any future tuning must preserve worker isolation; mutable DB state cannot be
  shared across workers.
- The real Postgres validation path remains available as
  `npm run test:db:postgres` for schema-push fidelity and semantic spot checks.
