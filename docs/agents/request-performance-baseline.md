# Request Performance Baseline

Baseline captured on 2026-06-22 for issue #133 using the local Postgres-backed
DB path:

```bash
REQUEST_PERFORMANCE_BASELINE_LOG=1 npm run test:db:file:final -- tests/request-performance/critical-request-baseline.db.test.ts
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
