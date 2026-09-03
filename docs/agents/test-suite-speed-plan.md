# Plan: speed up the test suite

This plan captures the future improvement for speeding up En Escena's tests
without lowering validation confidence. It is based on the research done on
`mattpocock/course-video-manager`, which this repo already takes as its workflow
reference.

## Current context

> Note (issue #310, 2026-07-18): the script zoo described below was consolidated.
> See the "Operational amendment 2026-07-18" at the end of this section for the
> current model. The historical sections are kept as a record of the measurements
> that led to the decision.

En Escena separates regular tests and DB tests. Current model (post-#310):

- `pnpm test`: runs unit/react (`pnpm test:unit`) plus the DB suite on in-process
  `PGlite` (`pnpm test:db`), without local Postgres. It is the single pre-commit
  confidence command.
- `pnpm test:unit`: only the regular suite, excluding `*.db.test.ts`.
- `pnpm test:db`: full DB suite on the `PGlite` harness with a cached schema
  snapshot. Focus one file with `pnpm test:db <file>`.
- `pnpm test:db:postgres`: the high-fidelity path on real Postgres via
  `TEST_DATABASE_URL`, reserved for the CI gate on the PR (#305). Focus one file
  with `pnpm test:db:postgres <file>`.

The Postgres path uses a local Postgres at `localhost:5433`, configured by
`TEST_DATABASE_URL`. On agents with a managed sandbox, that local TCP access can
require elevated approval even though it never leaves the machine. That is why
`docs/agents/workflows.md` documents the persistent prefixes:

- `pnpm test:db:postgres`
- `pnpm db:test:reset`
- `docker compose up -d postgres`

## Operational amendment 2026-07-18

Issue #310 re-measured the full `PGlite` suite in parallel as a prerequisite of
the AFK platform (map #319), where the implementer and the reviewer must run the
same validation on a GitHub Actions runner with no Postgres service.

- The `PGlite failed to initialize properly` instability reported on 2026-06-21
  no longer reproduces with `@electric-sql/pglite@0.5.3` and `vitest@3.2.x`.
- The full parallel suite (`vitest --config vitest.db.fast.config.ts`,
  `fileParallelism: true`, `maxWorkers: 50%`) passed 4 consecutive runs, 63 files
  and 345 tests each, in ~86-120s of wall clock on a loaded machine, with no
  worker-init failures.

Decision: `PGlite` becomes the default path. `pnpm test` runs unit + DB on
`PGlite` without local Postgres; real Postgres stays as `pnpm test:db:postgres`,
reserved for the CI gate (#305). The `test:db:final`, `test:db:fast:full`,
`test:db:file`, `test:db:file:final` and `test:db:file:postgres` aliases are
consolidated. If the parallel suite regresses to instability, the fallback is
running it single-worker/sharded before going back to Postgres. See
`docs/adr/0007-db-test-isolation-model.md` (2026-07-18 amendment).

## Issue #126 implementation

Measurement taken on 2026-06-20 on `sandcastle/issue-126` against the focused DB
harness:

| Path               | Command                                                  | Wall clock | Relevant breakdown                     |
| ------------------ | -------------------------------------------------------- | ---------: | -------------------------------------- |
| Preserved Postgres | `pnpm test:db:file:postgres tests/db/harness.db.test.ts` |      3.95s | Vitest `Duration` 1.03s; `tests` 130ms |
| PGlite fast path   | `pnpm test:db:file tests/db/harness.db.test.ts`          |      3.18s | Vitest `Duration` 2.13s; `tests` 705ms |

Operational reading:

- The measured improvement of the focused command is `770ms` less wall clock for
  the harness test on this branch.
- `pnpm test:db:file` remains the fast focused path and `pnpm test:db` remains
  the reliable final path.
- The schema snapshot is cached by schema hash so focused runs can be repeated
  without touching `TEST_DATABASE_URL`.

## Operational amendment 2026-06-21

After closing the implementation issues, the suites' state was revalidated:

- `pnpm test`: green, 27 files and 127 tests, ~24s.
- `pnpm test:db:final`: green against real Postgres, 28 files and 241 tests, ~80s.
- `pnpm test:db:file <file>`: green for the focused files tested with `PGlite`.
- `pnpm test:db:fast:full`: fails in default parallel mode with the error
  `PGlite failed to initialize properly`; the same suite passes serialized with
  `--maxWorkers=1 --no-file-parallelism`, but takes ~99s.

Operational decision: `PGlite` stays as the fast focused path for TDD and the
default full suite goes back to real Postgres. Investigating `PGlite` concurrency
is out of scope for this adjustment.

## Current baseline

Repeatable measurement taken on 2026-06-20 on `sandcastle/issue-122`.

Methodology:

- Wall clock: the shell's `time` over the full command.
- Internal breakdown: Vitest's `Duration` output where applicable. Fields such as
  `collect` and `tests` are Vitest aggregate times and can exceed wall clock when
  there is parallel work.
- For the `test:db:file` and `test:db` commands, wall clock includes
  `pnpm db:test:reset`.

### Measurements

| Surface              | Command                                                                             | Wall clock | Relevant breakdown                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- | ---------: | -------------------------------------------------------------------------------------- |
| Regular suite        | `pnpm test`                                                                         |     20.86s | 25 files / 120 tests green; Vitest `Duration` 19.43s; `collect` 60.85s; `tests` 44.33s |
| DB schema reset      | `pnpm db:test:reset`                                                                |      2.31s | No Vitest; fixed cost before every DB run                                              |
| Focused DB harness   | `pnpm test:db:file tests/db/harness.db.test.ts`                                     |      4.90s | 2 tests; Vitest `Duration` 1.29s; `collect` 670ms; `tests` 167ms                       |
| Small DB             | `pnpm test:db:file app/lib/admin/users/internal-invitation-route.server.db.test.ts` |      5.45s | 1 test; Vitest `Duration` 2.02s; `collect` 1.21s; `tests` 257ms                        |
| Medium DB            | `pnpm test:db:file app/lib/events/management.server.db.test.ts`                     |      5.64s | 14 tests; Vitest `Duration` 2.18s; `collect` 670ms; `tests` 952ms                      |
| Large / high-risk DB | `pnpm test:db:file app/lib/admin/events/event-bases-validation.server.db.test.ts`   |     19.39s | 22 tests; Vitest `Duration` 15.74s; `collect` 8.77s; `tests` 6.45s                     |
| Full DB suite        | `pnpm test:db`                                                                      |     80.32s | 27 files / 238 tests green; Vitest `Duration` 77.40s; `collect` 28.10s; `tests` 42.99s |

### Pre-existing failures at measurement time

There were no pre-existing failures in this baseline run:

- `pnpm test`: 25 green files, 120 green tests.
- `pnpm test:db`: 27 green files, 238 green tests.

Outcome of issue `#123`: the DB baseline was revalidated on 2026-06-20 on
`sandcastle/issue-123`, after integrating `#122`, to identify pre-existing
failures before optimizing the harness:

- `pnpm test:db:file tests/db/harness.db.test.ts`: 1 green file, 2 green tests.
- `pnpm test:db`: 27 green files, 238 green tests.
- DB files with a pre-existing failure: none.
- DB failure modes to isolate from harness changes: none.

Operational conclusion: the current baseline for the optimization work has no
outstanding pre-existing DB failures. Any new DB failure on top of this baseline
must be treated as a regression of the change in flight, not as prior harness
debt.

### Baseline observations

- The fixed cost of `db:test:reset` already consumes ~2.31s before Vitest runs.
- On small or medium files, `collect` and importing weigh more than the actual
  test execution.
- In the full DB suite the dominant time is already test execution (`42.99s`),
  but `collect` is still a material cost (`28.10s`).
- `app/lib/admin/events/event-bases-validation.server.db.test.ts` is confirmed as
  a large, high-risk surface for comparing future improvements.

## External reference

`mattpocock/course-video-manager` solved a similar problem in June 2026:

- Issue: <https://github.com/mattpocock/course-video-manager/issues/976>
- PR: <https://github.com/mattpocock/course-video-manager/pull/979>
- ADR in the reference repo:
  `docs/adr/0014-test-database-isolation.md`
- Key files in the reference repo:
  - `vite.config.ts`
  - `app/test-utils/pglite.ts`
  - `app/test-utils/global-setup.ts`

Relevant findings:

- The reference repo has no separate `test:db`; it uses a single `pnpm test` with
  Vitest.
- Its DB tests use in-process PGlite, not a real Postgres over a port.
- They identified two dominant costs:
  - repeated module loading with `isolate: true`;
  - redundant schema creation with `drizzle-kit pushSchema`.
- They implemented two improvements:
  - splitting Vitest into a shared project with `isolate: false` and an isolated
    project for files using `vi.mock` or `vi.stub*`;
  - creating a PGlite schema snapshot once in `globalSetup` and loading it in
    every DB file.
- They reported improvements:
  - full suite from 27.7s to 13.4s;
  - per-file DB setup from 724ms to 263ms.
- They recorded a deferred alternative: real Postgres on a port, with a DB or
  schema per worker using `VITEST_POOL_ID`. They discarded it for now because
  PGlite gave enough speed without Docker, ports or a native dependency.

## Goal

Reduce test feedback time, especially for DB, while keeping these properties:

- DB tests isolated from production data;
- tests exercising the same kind of interface the app uses;
- the ability to do fast focused runs during TDD;
- a reliable final run for schema changes, repositories, persistent
  loaders/actions and data-backed business rules.

## Decision update 2026-06-20

Issue `#125` closed the plan's pending decision:

- Comparison decided:
  - `PGlite with schema snapshots`: wins as the next implementation because the
    current baseline has a measured fixed cost of `db:test:reset` (~2.31s per
    run), there are no pre-existing DB failures, and the `#124` POC already
    successfully covered schema, FKs, constraints, transactions, `jsonb` and the
    relevant raw queries.
  - `Real Postgres per worker`: stays as the higher-fidelity fallback, but it
    still requires a template per worker, cleanup, `localhost:5433`, and it has
    no measured improvement in this repo that justifies taking it first.
- Decision: implement a fast path with `PGlite` and schema snapshots first,
  keeping a reliable final run on real Postgres — now exposed as
  `pnpm test:db:final` — until the new path is proven.
- ADR: see `docs/adr/0007-db-test-isolation-model.md`.

## Issue #128 update

Issue `#128` evaluated the next pending optimization: splitting Vitest into a
shared project with `isolate: false` and an isolated project for risky files, or
disabling module isolation more broadly.

### Measurement applied

Test taken on 2026-06-20 on `sandcastle/issue-128` against the regular suite,
because that is where most of the mocks and global mutations conditioning the
decision live:

| Experimental path | Command                                                                 | Wall clock | Result     |
| ----------------- | ----------------------------------------------------------------------- | ---------: | ---------- |
| Current baseline  | `vitest --run --exclude tests/db/db-test-workflow.test.ts`              |     13.45s | Green      |
| Without isolation | `vitest --run --no-isolate --exclude tests/db/db-test-workflow.test.ts` |     14.97s | 2 failures |

Operational reading:

- `isolate: false` was `1.52s` slower in this repo for the regular suite
  measured, so it produced no material time improvement.
- The experimental run also introduced real failures before even considering DB
  tests or a project mix.

### Failures observed with `--no-isolate`

- `app/components/auth/access-ui.test.tsx` failed with
  `(0 , jsxDEV) is not a function`, a sign of cross-file contamination at the
  runtime or module cache level.
- `app/lib/shared/route-notification-toasts.test.ts` stopped observing the
  expected call to `toast.success`, a sign of contamination across shared mocks.

### Files identified as mandatorily isolated before any adoption

DB tests with mocks or shared module state:

- `app/lib/academies/registration.server.db.test.ts`
- `app/lib/auth/access-recovery.server.db.test.ts`

Regular suite with mocks, stubs, module resets or environment mutation:

- `app/lib/shared/email.server.test.ts`
- `app/lib/shared/route-notification-toasts.test.ts`
- `app/lib/auth/access-auth-provider.server.test.ts`
- `app/lib/auth/private-header.render.test.tsx`
- `app/lib/auth/access-ui.validation.test.ts`
- `app/lib/auth/access-recovery.server.test.ts`
- `app/lib/admin/dancers/inscriptions-section.render.test.tsx`
- `app/features/portal/shell/view.test.tsx`
- `app/features/portal/roster/view-transitions.render.test.tsx`
- `app/features/portal/profile/action.test.ts`
- `app/features/portal/profile/view.test.tsx`
- `app/features/portal/choreographies/request-flow.render.test.tsx`
- `app/lib/admin/events/events-route.render.test.tsx`
- `app/lib/admin/route.render.test.tsx`

Regular suite with global mutations of `window`, `document` or the DOM runtime:

- `app/features/admin/prices/view.test.tsx`
- `app/components/shared/data-table.test.tsx`
- `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`
- `app/features/portal/professors/create/submission.test.tsx`
- `app/features/portal/dancers/create/submission.test.tsx`
- `app/features/portal/dancers/detail/submission.test.tsx`
- `app/features/portal/dancers/create/dialog.test.tsx`
- `app/features/portal/choreographies/create/dialog.render.test.tsx`
- `app/components/auth/access-ui.test.tsx`

### Decision

No Vitest project split and no shared mode with `isolate: false` is adopted for
now.

Measured rationale:

- With no material time improvement and immediate failures under `--no-isolate`,
  adding a `shared` project would force maintaining a broad exception list
  without justifying the extra complexity.
- The two DB tests with `vi.mock` already force separating safe paths if this
  idea is ever revisited.
- The regular suite also requires a long list of isolated files, and the expected
  benefit was invalidated by the current measurement.

Operational conclusion: keep the current single-project-per-suite configuration
(`vitest.config.ts`, `vitest.db.fast.config.ts`, `vitest.db.config.ts`) until a
measurable improvement and a tighter isolation strategy appear.

No Vitest configuration changes were made for this decision. That is why repeated
runs with random ordering are out of scope in `#128`: they are acceptance
criteria for adopting a shared project, not for a documented decision not to
adopt the change.

## Implementation proposal

### Phase 1: measure before changing

Create a repeatable baseline:

1. Measure `pnpm test`.
2. Measure `pnpm test:db:file tests/db/harness.db.test.ts`.
3. Measure 3 representative DB files:
   - a small one;
   - a medium one;
   - a large one, for example `app/lib/admin/events/event-bases-validation.server.db.test.ts`
     or `app/features/portal/choreographies/detail/server.db.test.ts`.
4. Measure `pnpm test:db` once the suite is green.
5. Separate the times of:
   - `db:test:reset`;
   - Vitest collect/import;
   - actual test execution.

Expected result: a table of times before any refactor.

Current status: complete. The baseline table above is the comparison reference
for this plan's child issues.

### Phase 2: study PGlite compatibility

Validate whether En Escena can use PGlite for all or some DB tests:

1. Experimentally install `@electric-sql/pglite` on a branch.
2. Create a helper equivalent to `tests/db/harness.ts`, but in-process:
   - `createTestDb()`;
   - `truncateAllTables(testDb)`;
   - schema applied with `drizzle-kit/api`.
3. Migrate only `tests/db/harness.db.test.ts`, or create a new pilot test.
4. Test the types and queries used by the current schema:
   - enums;
   - foreign keys;
   - constraints;
   - `json/jsonb` if applicable;
   - transactions;
   - raw SQL used by repositories.
5. Document incompatibilities or differences against real Postgres.

Go/no-go criterion: if PGlite covers the behavior the app needs, we can continue
with the snapshot. If not, move to the real-Postgres-per-worker alternative.

### Phase 3A: PGlite with schema snapshot

If PGlite is compatible:

1. Add `app/test-utils/global-setup.ts` or `tests/db/global-setup.ts` that:
   - creates a PGlite instance;
   - applies the schema with `pushSchema`;
   - exports a snapshot with `dumpDataDir`;
   - writes the snapshot to `tmpdir`;
   - provides it to Vitest with `provide`.
2. Change `createTestDb()` to:
   - load `loadDataDir` from the injected snapshot;
   - keep a fallback to `pushSchema` when running a file without `globalSetup`.
3. Keep `truncateAllTables` in `beforeEach` for per-test isolation.
4. Migrate DB files in groups, prioritizing those that do not depend on behavior
   exclusive to real Postgres.
5. Keep a final run against real Postgres if we find relevant fidelity
   differences.

Risks:

- PGlite may not cover some detail that real Postgres validates today.
- The snapshot validates the schema generated by `pushSchema`, not a divergent
  manual migration.

### Phase 3B: real Postgres per worker

If PGlite is not enough:

1. Keep local Postgres as the fidelity source.
2. Build a test template once per run:
   - create the base DB or schema;
   - apply the Drizzle schema;
   - freeze it as a template.
3. For each Vitest worker, create an isolated DB or schema using
   `VITEST_POOL_ID`.
4. Configure `TEST_DATABASE_URL` per worker before importing `@/db`.
5. Remove serial execution only after proving real isolation.

Technical preference: DB/schema per worker rather than dynamic table prefixes.
The `course-video-manager` reference rejected dynamic prefixes because
`pgTableCreator` fixes the prefix when the schema is imported.

Risks:

- More operational complexity.
- It still requires sandbox approval for `localhost:5433`.
- It needs robust cleanup of temporary DBs/schemas.

### Phase 4: split Vitest projects

Independently of PGlite or real Postgres, evaluate a Vitest project split as in
`course-video-manager`:

1. `shared` project:
   - `isolate: false`;
   - most tests without global mocks;
   - DB tests if they are stable without module isolation.
2. `isolated` project:
   - files using `vi.mock`, `vi.stubGlobal`, `vi.stubEnv` or mutating shared
     global/module state;
   - keeps `isolate: true`.
3. Add an explicit list of isolated files in the config.
4. Verify with random ordering:
   - `vitest run --sequence.shuffle`;
   - repeat at least 3 times before accepting the change.

Risks:

- `isolate: false` can introduce flakes from shared global state.
- Files with mocks/stubs must be moved to the isolated project as soon as they
  are detected.

### Phase 5: update workflows and commands

Once the strategy is proven:

1. Update `package.json`:
   - keep the focused commands;
   - add fast commands if appropriate, for example `test:db:fast`;
   - keep a reliable final command.
2. Update `docs/agents/workflows.md`:
   - which command to use during TDD;
   - which command to use before closing;
   - which sandbox approvals are still necessary.
3. If PGlite is adopted, update `docs/local-auth.md` to clarify that DB tests no
   longer necessarily depend on local Postgres in every mode.
4. Record the decision as an ADR if the DB isolation model changes.

## Acceptance criteria

- The regular suite and the DB suite are green before and after the change.
- Focused runs still work with a single file path.
- The full DB suite improves by at least 30% in wall clock, or it is documented
  why the improvement does not offset the risk.
- If `isolate: false` is used, the suite passes 3 times with `--sequence.shuffle`.
- The final workflow keeps a run with enough fidelity for the rules of Event,
  Academy, Choreography, `Bases del evento`, User and `Sesión de acceso`.

## Initial recommendation

Start with a PGlite-plus-snapshot proof of concept on 1 or 2 small DB files. If a
fidelity incompatibility with Postgres shows up, shift focus to real Postgres per
worker. It is not worth starting directly by parallelizing the current suite:
today the serial harness and the shared Postgres are part of the isolation.
