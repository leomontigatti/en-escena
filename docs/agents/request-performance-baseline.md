# Request Performance Baseline

Baseline captured on 2026-06-22 for issue #133 using the local Postgres-backed
DB path:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

The rerunnable harness lives in
`tests/request-performance/critical-request-baseline.db.test.ts`.

## Notes

- Timings are local wall-clock milliseconds from one controlled route run per
  scenario.
- `requestMs` is the loader/action request itself.
- `roundTripMs` adds the follow-up loader revalidation after mutations.
- Phase sums can exceed `requestMs` when the route does parallel work (for
  example `Promise.all`) or when a shared helper performs nested calls.
- No production instrumentation was kept. The only retained measurement code is
  the DB-backed test harness.

## Administración

| Route                                                   | requestMs | roundTripMs | authSessionMs | eventContextMs | mainQueryMs | readiness/configurationMs | actionMs | revalidationMs |
| ------------------------------------------------------- | --------: | ----------: | ------------: | -------------: | ----------: | ------------------------: | -------: | -------------: |
| `administracion` loader                                 |      6.75 |        6.75 |          3.91 |           1.45 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `administracion.eventos` loader                         |     46.84 |       46.84 |          2.33 |           0.00 |        0.59 |                     82.63 |     0.00 |           0.00 |
| `administracion.eventos_.nuevo` action                  |     13.57 |       27.21 |          3.84 |           0.00 |        0.00 |                      0.00 |     2.85 |          13.63 |
| `administracion.eventos_.$eventId` loader               |      6.13 |        6.13 |          3.54 |           0.00 |        2.12 |                      1.26 |     0.00 |           0.00 |
| `administracion.eventos_.$eventId` update action        |      8.15 |       13.71 |          2.67 |           0.00 |        0.00 |                      0.00 |     3.70 |           5.56 |
| `administracion.modalidades` shared bases loader        |     11.13 |       11.13 |          3.36 |           1.31 |        0.00 |                      6.10 |     0.00 |           0.00 |
| `administracion.modalidades_.nueva` shared bases action |     14.64 |       24.05 |          3.09 |           1.78 |        0.00 |                      0.00 |     9.08 |           9.41 |
| `administracion.bailarines` loader                      |     13.03 |       13.03 |          2.90 |           1.31 |        8.32 |                      0.00 |     0.00 |           0.00 |
| `administracion.profesores` loader                      |     11.48 |       11.48 |          2.88 |           1.29 |        6.80 |                      0.00 |     0.00 |           0.00 |

## Portal

| Route                                                | requestMs | roundTripMs | authSessionMs | eventContextMs | mainQueryMs | readiness/configurationMs | actionMs | revalidationMs |
| ---------------------------------------------------- | --------: | ----------: | ------------: | -------------: | ----------: | ------------------------: | -------: | -------------: |
| `portal` loader                                      |     14.16 |       14.16 |          3.14 |          10.81 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines` loader                           |      9.21 |        9.21 |          3.70 |           1.82 |        3.47 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines` create action                    |      7.41 |       15.87 |          3.19 |           0.00 |        0.00 |                      0.00 |     2.89 |           8.46 |
| `portal.bailarines_.$dancerId` loader                |      5.43 |        5.43 |          3.47 |           0.00 |        1.65 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines_.$dancerId` update action         |     11.85 |       17.00 |          3.92 |           0.00 |        0.00 |                      0.00 |     6.82 |           5.14 |
| `portal.profesores` loader                           |      7.10 |        7.10 |          3.26 |           1.25 |        2.39 |                      0.00 |     0.00 |           0.00 |
| `portal.profesores` create action                    |      7.70 |       14.10 |          3.63 |           0.00 |        0.00 |                      0.00 |     2.94 |           6.40 |
| `portal.profesores_.$professorId` loader             |      5.44 |        5.44 |          3.66 |           0.00 |        1.45 |                      0.00 |     0.00 |           0.00 |
| `portal.profesores_.$professorId` update action      |      9.41 |       13.40 |          3.46 |           0.00 |        0.00 |                      0.00 |     5.10 |           3.98 |
| `portal.coreografias` loader                         |     21.64 |       21.64 |          3.30 |           1.23 |       18.41 |                     16.37 |     0.00 |           0.00 |
| `portal.coreografias` create action                  |      5.17 |       19.70 |          3.02 |           0.00 |        0.00 |                      0.00 |     1.19 |          14.53 |
| `portal.coreografias_.$choreographyId` loader        |     12.99 |       12.99 |          3.03 |           1.14 |        8.47 |                      0.00 |     0.00 |           0.00 |
| `portal.coreografias_.$choreographyId` update action |      8.29 |       22.17 |          3.34 |           1.91 |        0.00 |                      0.00 |     1.37 |          13.88 |
| `portal.perfil` loader                               |      3.32 |        3.32 |          3.13 |           0.00 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `portal.perfil` update action                        |      8.04 |       11.43 |          3.68 |           0.00 |        0.00 |                      0.00 |     2.92 |           3.38 |

## Follow-up: RHF Submit Standard

Follow-up captured on 2026-06-22 after migrating the remaining auth shared
forms, `portal.perfil`, and `administracion.usuarios_.nuevo` away from native
`form.submit()` and changing the shared RHF + React Router helper to submit
`FormData` instead of `Record<string, string>`.

Command:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

Notes:

- This harness measures server loader/action timings and post-action
  revalidation. It does not measure browser remount cost, duplicate-click
  prevention, or perceived pending-state improvements from the submit refactor.
- The main expectation for this slice is preserved server timing with better
  client request flow and safer form serialization.
- Use this table as the `now` point for later loader/query optimizations.

| Route                                                   | requestMs | roundTripMs | authSessionMs | eventContextMs | mainQueryMs | readiness/configurationMs | actionMs | revalidationMs |
| ------------------------------------------------------- | --------: | ----------: | ------------: | -------------: | ----------: | ------------------------: | -------: | -------------: |
| `administracion` loader                                 |     24.44 |       24.44 |         14.92 |           0.00 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `administracion.eventos` loader                         |     55.25 |       55.25 |          5.32 |           0.00 |        1.38 |                     91.82 |     0.00 |           0.00 |
| `administracion.eventos_.nuevo` action                  |     15.01 |       30.70 |          5.20 |           0.00 |        0.00 |                      0.00 |     2.60 |          15.68 |
| `administracion.eventos_.$eventId` loader               |      5.12 |        5.12 |          3.35 |           0.00 |        2.51 |                      1.21 |     0.00 |           0.00 |
| `administracion.eventos_.$eventId` update action        |     11.84 |       17.48 |          3.75 |           0.00 |        0.00 |                      0.00 |     6.04 |           5.64 |
| `administracion.modalidades` shared bases loader        |     12.78 |       12.78 |          4.27 |           1.54 |        0.00 |                      6.57 |     0.00 |           0.00 |
| `administracion.modalidades_.nueva` shared bases action |     16.60 |       28.38 |          4.23 |           1.92 |        0.00 |                      0.00 |     9.72 |          11.78 |
| `administracion.bailarines` loader                      |     12.98 |       12.98 |          3.01 |           0.57 |        8.90 |                      0.00 |     0.00 |           0.00 |
| `administracion.profesores` loader                      |     11.28 |       11.28 |          3.36 |           0.56 |        6.86 |                      0.00 |     0.00 |           0.00 |
| `portal` loader                                         |     11.37 |       11.37 |          6.40 |           4.50 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines` loader                              |      7.80 |        7.80 |          4.43 |           1.26 |        1.83 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines` create action                       |      9.54 |       18.43 |          4.85 |           0.00 |        0.00 |                      0.00 |     3.20 |           8.90 |
| `portal.bailarines_.$dancerId` loader                   |      5.34 |        5.34 |          3.97 |           0.00 |        1.07 |                      0.00 |     0.00 |           0.00 |
| `portal.bailarines_.$dancerId` update action            |     13.11 |       18.76 |          4.44 |           0.00 |        0.00 |                      0.00 |     7.46 |           5.65 |
| `portal.profesores` loader                              |      6.05 |        6.05 |          3.57 |           0.67 |        1.59 |                      0.00 |     0.00 |           0.00 |
| `portal.profesores` create action                       |      8.71 |       15.47 |          3.82 |           0.00 |        0.00 |                      0.00 |     3.73 |           6.75 |
| `portal.profesores_.$professorId` loader                |      4.74 |        4.74 |          3.55 |           0.00 |        0.89 |                      0.00 |     0.00 |           0.00 |
| `portal.profesores_.$professorId` update action         |     13.58 |       18.91 |          3.96 |           0.00 |        0.00 |                      0.00 |     8.75 |           5.33 |
| `portal.coreografias` loader                            |     33.40 |       33.40 |          3.40 |           9.58 |       23.09 |                     25.04 |     0.00 |           0.00 |
| `portal.coreografias` create action                     |      7.23 |       22.98 |          4.48 |           0.00 |        0.00 |                      0.00 |     1.65 |          15.76 |
| `portal.coreografias_.$choreographyId` loader           |     15.16 |       15.16 |          4.02 |           1.87 |        8.87 |                      0.00 |     0.00 |           0.00 |
| `portal.coreografias_.$choreographyId` update action    |      8.09 |       24.52 |          4.15 |           0.64 |        0.00 |                      0.00 |     1.51 |          16.43 |
| `portal.perfil` loader                                  |      3.93 |        3.93 |          3.71 |           0.00 |        0.00 |                      0.00 |     0.00 |           0.00 |
| `portal.perfil` update action                           |      8.13 |       12.57 |          3.68 |           0.00 |        0.00 |                      0.00 |     2.88 |           4.44 |

Comparison protocol for future runs:

1. Keep the same command and Postgres-backed test path for comparable numbers.
2. Record the date, branch or commit, and the implementation slice that changed.
3. Compare the same route ids by `requestMs`, `roundTripMs`, phase timings, and
   request source (`useSubmit`, `fetcher.submit`, or native form path).
4. Treat one-run timing shifts as directional only. Confirm meaningful wins with
   repeated runs or query-count evidence before changing optimization priority.

## First Optimization Targets

1. `administracion.eventos` loader.
   The request wall time is the highest measured route, and the readiness phase
   fans out across multiple `getEventRegistrationReadiness` calls.
2. `portal.coreografias` loader.
   It combines event-context work, choreography listing, dancer/professor
   lookups, and bases loading in one request.
3. `portal.coreografias` create/update actions.
   The mutation work itself is small; the post-action revalidation dominates the
   round trip.
4. Shared `administracion` bases actions.
   The mutation and the follow-up revalidation are similarly expensive, so the
   shared seam is a good place to cut duplicate work once.
5. `portal` layout event-context loader.
   The shell-level `getPortalEventContext` work is already a noticeable fixed
   cost before child route queries start.

## Follow-up: Administración Eventos Readiness Batching

Follow-up captured on 2026-06-22 after changing the `administracion.eventos`
loader to use a list-oriented registration-readiness helper that reads cached
readiness for all visible event ids in one query before recalculating dirty
entries.

Command:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

Target comparison against the RHF Submit Standard follow-up:

| Route                           | requestMs before | requestMs after | readiness/configurationMs before | readiness/configurationMs after |
| ------------------------------- | ---------------: | --------------: | -------------------------------: | ------------------------------: |
| `administracion.eventos` loader |            55.25 |           53.44 |                            91.82 |                           49.47 |

Interpretation:

- The readiness phase moved in the expected direction because the list route no
  longer performs one cached-read query per relevant row.
- The total request timing should still be treated as directional; this is a
  single local run and other routes moved around due to normal test/runtime
  variance.
- The next real loader/query slice remains `portal.coreografias`, especially
  separating route-critical list data from create-flow data.

## Follow-up: Portal Coreografías Create Options Deferral

Follow-up captured on 2026-06-22 after splitting `portal.coreografias` data
loading into:

- the list route loader, which now returns event context, the choreography list,
  and an active dancer count for the create button; and
- `/portal/coreografias/crear`, a resource loader that fetches active dancers,
  active professors, and event base options only when the create dialog opens.

Command:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

Target comparison against the RHF Submit Standard follow-up:

| Route                                       | requestMs before | requestMs after | mainQueryMs before | mainQueryMs after | readiness/configurationMs before | readiness/configurationMs after |
| ------------------------------------------- | ---------------: | --------------: | -----------------: | ----------------: | -------------------------------: | ------------------------------: |
| `portal.coreografias` loader                |            33.40 |           22.56 |              23.09 |              9.46 |                            25.04 |                            0.00 |
| `portal.coreografias` create-options loader |              n/a |           21.35 |                n/a |              6.59 |                              n/a |                           15.71 |

Interpretation:

- The initial navigation no longer waits for create-flow dancers, professors, or
  event-base option loading.
- Opening the create dialog now pays that cost explicitly through a localized
  pending state, so this is a route-navigation improvement rather than a total
  elimination of work.
- Future optimization can target the create-options loader itself if first modal
  open feels slow, especially by slimming event-base option loading.

## Follow-up: Portal Coreografías Slim Create Options

Follow-up captured on 2026-06-22 after replacing full `getEventBases` loading
inside `/portal/coreografias/crear` with a slim registration-options query that
returns only modalities and submodalities for the first create-flow steps.

Command:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

Target comparison against the create-options deferral follow-up:

| Route                                       | requestMs before | requestMs after | mainQueryMs before | mainQueryMs after | readiness/configurationMs before | readiness/configurationMs after |
| ------------------------------------------- | ---------------: | --------------: | -----------------: | ----------------: | -------------------------------: | ------------------------------: |
| `portal.coreografias` create-options loader |            21.35 |            7.73 |               6.59 |              4.21 |                            15.71 |                            0.00 |

Interpretation:

- The create dialog options resource no longer loads categories, schedules,
  schedule capacities, prices, or other base data that the initial create steps
  do not render.
- The remaining cost is mostly auth/event context plus the active
  dancers/professors option lists.
- Further improvements should be driven by real list sizes or UX feedback
  before splitting dancers/professors into later step-specific requests.

## Follow-up: Portal Coreografía Detail Option Parallelization

Follow-up captured on 2026-06-22 after loading available dancer and professor
options in parallel inside the `portal.coreografias_.$choreographyId` loader.

Command:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 pnpm test:db:postgres tests/request-performance/critical-request-baseline.db.test.ts
```

Target comparison against the slim create-options follow-up:

| Route                                                | requestMs before | requestMs after | roundTripMs before | roundTripMs after |
| ---------------------------------------------------- | ---------------: | --------------: | -----------------: | ----------------: |
| `portal.coreografias_.$choreographyId` loader        |            15.20 |           13.73 |              15.20 |             13.73 |
| `portal.coreografias_.$choreographyId` update action |             7.26 |            7.25 |              21.24 |             19.31 |

Interpretation:

- The win is smaller than the earlier over-fetching fixes because the detail
  loader still needs choreography data plus both option lists to render the
  editing surface.
- This was still worth doing because it removes an unnecessary sequential wait
  on every direct detail load and post-update revalidation.
