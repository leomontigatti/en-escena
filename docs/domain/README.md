# Domain Rules

`CONTEXT.md` is the canonical glossary. These files hold detailed business rules that would make the glossary too heavy.

Read order for domain work:

1. `CONTEXT.md`
2. Relevant ADRs in `docs/adr/`
3. Relevant files in `docs/domain/`

## Files

- [events.md](./events.md) - event context, settings, administration and portal shell rules.
- [access.md](./access.md) - registration, users, sessions and invitations.
- [choreographies.md](./choreographies.md) - roster links, choreography registration, locks and Bases del evento.
- [judging.md](./judging.md) - presentations, judging, ranking, results, scores and feedback.
- [finances.md](./finances.md) - canonical finance model: inscriptions, payments, allocations, the two thresholds and the three statuses, pricing, withdrawal and invoicing.
- [rules.md](./rules.md) - index for compatibility.

Implementation entry points live in
[docs/agents/codebase-map.md](../agents/codebase-map.md). Keep domain files
focused on behavior and use the codebase map for routes, modules and tests.
