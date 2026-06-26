# Decide fast DB test isolation around PGlite snapshots

**Status**: amended

En Escena needs a faster DB feedback loop without losing confidence on rules
persisted in Postgres. The measured baseline from 2026-06-20 was:

- `pnpm db:test:push`: 2.31s fixed cost before every DB run.
- `pnpm test:db:file tests/db/harness.db.test.ts`: 4.90s wall clock.
- `pnpm test:db`: 80.32s wall clock for 27 files and 238 passing tests.
- Existing DB failures at decision time: none. Issue `#123` revalidated the
  baseline and confirmed there were no preexisting DB failures to discount.

Issue `#127` then scaled the chosen model to the full DB suite with these
results on 2026-06-20:

- `pnpm test:db`: 45.23s wall clock for 28 files and 241 passing tests.
- `pnpm test:db:postgres`: 79.05s wall clock for the same 28 files and 241
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

En Escena adopts PGlite with schema snapshots for focused DB feedback, while
keeping the full default DB suite on the reliable Postgres validation path.

Why this option won now:

- The current baseline has no preexisting DB failures, so the next change can
  be judged cleanly as a regression or improvement.
- The baseline shows a meaningful fixed setup tax before every DB run; PGlite
  snapshots directly target that cost.
- The PGlite POC already proved compatibility for the schema and SQL patterns
  En Escena depends on today.
- Real Postgres per worker remains plausible, but it adds more moving parts
  before it removes any measured cost in this repo.

This decision does not delete the real Postgres harness. The focused
`pnpm test:db:file <path>` path uses the PGlite snapshot harness for fast
feedback, while `pnpm test:db` and `pnpm test:db:postgres` preserve the
high-fidelity validation path through `TEST_DATABASE_URL`. The full PGlite
suite remains available as `pnpm test:db:fast:full` for harness debugging,
but it is not the default confidence command.

**Amendment on 2026-06-21**

After the implementation issues closed, the default full PGlite suite was
rechecked. Focused PGlite files passed individually, and the full PGlite suite
also passed when forced to one worker, but the default parallel full-suite mode
failed with `PGlite failed to initialize properly` in worker-initialization
paths. The reliable Postgres suite passed 28 files and 241 tests in about 80s.

Because the parallel PGlite full suite is not currently reliable,
`pnpm test:db` now delegates to the final Postgres path. PGlite remains
useful for focused TDD via `pnpm test:db:file <path>`, where it avoids
the repeated schema push and does not require local Postgres.

**Fidelity Risks**

- `Evento`: active-event uniqueness, registration windows, and lifecycle rules
  rely on DB constraints and date logic covered by
  `app/lib/events/management.server.db.test.ts`. Any divergence in constraint
  enforcement or timestamp semantics must block broader rollout.
- `Academia`: registration and academy-owned data flows depend on user/session
  creation and uniqueness behavior covered by
  `app/lib/academies/registration.server.db.test.ts` and
  `app/features/portal/shell/server.db.test.ts`.
- `Coreografia`: choreography registration, ownership, and active-event scoping
  use dense event-scoped joins and transactional writes covered by
  `app/features/portal/choreographies/detail/server.db.test.ts`,
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
  covered by the `app/lib/events/bases-repository-*.server.db.test.ts` and
  `app/lib/admin/events/event-bases-*.server.db.test.ts` files, plus
  `app/lib/events/registration-readiness.server.db.test.ts`.

**Fallback path**

If PGlite snapshots fail later because of incompatible query semantics, an
unacceptable error-shape adapter burden, unstable schema bootstrap, or a
surface-specific regression in Evento, Academia, Coreografia, Usuario, Sesion
de acceso, or Bases del evento, the fallback is real Postgres per worker:

1. Keep `pnpm test:db:postgres` on real Postgres as the final confidence
   path.
2. Build a template DB or schema once per run with the current Drizzle schema.
3. Provision one isolated DB or schema per Vitest worker using
   `VITEST_POOL_ID`.
4. Point each worker to its isolated Postgres target before importing `@/db`.
5. Only enable parallel DB workers after repeated runs prove isolation.

**Consequences**

- Focused DB iteration can use PGlite snapshots without local Postgres.
- The default full DB suite uses the real Postgres validation path for
  schema-push fidelity and confidence.
- The full PGlite suite is experimental until worker-initialization instability
  is fixed.
- Any future PGlite full-suite tuning must preserve worker isolation; mutable
  DB state cannot be shared across workers.
