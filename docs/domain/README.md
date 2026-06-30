# Domain Rules

`CONTEXT.md` is the canonical glossary. These files hold detailed business rules that would make the glossary too heavy.

Read order for domain work:

1. `CONTEXT.md`
2. Relevant ADRs in `docs/adr/`
3. Relevant files in `docs/domain/`

## Files

- [eventos.md](./eventos.md) - event context, settings, administration and portal shell rules.
- [acceso.md](./acceso.md) - registration, users, sessions and invitations.
- [coreografias.md](./coreografias.md) - roster links, choreography registration, locks and Bases del evento.
- [juzgamiento.md](./juzgamiento.md) - presentations, judging, ranking, results, scores and feedback.
- [finanzas.md](./finanzas.md) - financial states, invoices, payments, account balance and pricing.
- [auditoria.md](./auditoria.md) - traceability, audit history and state-level audit fields.
- [rules.md](./rules.md) - index for compatibility.

Implementation entry points live in
[docs/agents/codebase-map.md](../agents/codebase-map.md). Keep domain files
focused on behavior and use the codebase map for routes, modules and tests.
