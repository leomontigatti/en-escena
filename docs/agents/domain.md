# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** - read ADRs that touch the area you're about to work in.
- **`docs/domain/`** - read the domain rule file that touches the area you're about to work in.
- **`docs/agents/codebase-map.md`** - after choosing the domain area, use the
  map to find the usual routes, server modules and tests for that flow.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
|-- CONTEXT.md
|-- docs/domain/
|   `-- rules.md
|-- docs/adr/
|   |-- 0001-event-sourced-orders.md
|   `-- 0002-postgres-for-write-model.md
`-- src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal - either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Use domain rules for behavior

`CONTEXT.md` is intentionally short. Do not infer detailed behavior from glossary entries alone. Read `docs/domain/` for workflow, validation, lifecycle, finance, scoring, and configuration rules.

## Use the codebase map for implementation entry points

Domain docs describe the rule; they do not try to list every route or module.
When you need implementation context, use `docs/agents/codebase-map.md` to start
from the smallest likely set of files and tests, then verify with search before
editing.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) - but worth reopening because..._
