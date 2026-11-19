# Domain Rules

`GLOSSARY.md` owns canonical terms. Domain behavior lives in focused files:

- [events.md](./events.md) - event context, settings, administration and portal shell rules.
- [access.md](./access.md) - registration, users and sessions.
- [choreographies.md](./choreographies.md) - roster links, choreography registration, locks and `Bases del evento`.
- [judging.md](./judging.md) - presentations, judging, ranking, results, scores and feedback.
- [finances.md](./finances.md) - canonical finance model: inscriptions, payments, allocations, the two thresholds and the three statuses, pricing, withdrawal and invoicing.

Implementation entry points live in [docs/agents/codebase-map.md](../agents/codebase-map.md).

## Academies export

The auditor's academies export is a spreadsheet with one row per academy that has an active choreography or seminar inscription registered in the period of the selected event. Each row carries the academy's responsible person, its phone and the email it logs in with.
