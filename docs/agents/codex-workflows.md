# Codex Workflows

Project-local workflows for Codex agents working on En Escena.

These workflows adapt useful ideas from `mattpocock/course-video-manager` to this repo. They are not Claude hooks or Claude skills; they are repo instructions for Codex and other agents that read `AGENTS.md`.

## Command Guardrail

Use `npm run typecheck` for type validation.

Do not run `npx tsc` directly. `npm run typecheck` runs `react-router typegen && tsc --noEmit`, so generated route types are present before TypeScript checks the app.

Recommended validation order after code changes:

1. `npm run format`
2. `npm run format:check`
3. `npm run typecheck`
4. `npm test`
5. `npm run test:db` when the change touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules
6. `npm run build` when the change touches routing, server rendering, bundling, CSS, or deployment behavior

If a command fails, fix that failure and rerun the same command before moving to the next one.
Do not start a later validation command while an earlier command is still failing
or while formatting changes are unverified.

## React Router Flat Routes

This repo uses `@react-router/fs-routes` flat route naming. When adding a
dedicated form or detail route under a list URL, make the form/detail route a
sibling of the list route unless the list component intentionally renders an
`<Outlet />`.

Use a trailing underscore on the list segment in child filenames to avoid
accidental parent/child nesting:

- List: `administracion_.ajustes_.eventos.tsx`
- Detail sibling: `administracion_.ajustes_.eventos_.$eventId.tsx`
- New-form sibling: `administracion_.ajustes_.eventos_.nuevo.tsx`

Do not use `administracion_.ajustes_.eventos.$eventId.tsx` or
`administracion_.ajustes_.eventos.nuevo.tsx` unless
`administracion_.ajustes_.eventos.tsx` renders `<Outlet />`. Without an outlet,
the child route matches but the user keeps seeing the parent list instead of the
detail or form screen.

After adding or renaming route files, run `npm run typecheck` and inspect
`.react-router/types/+routes.ts` when route parentage matters. The target
form/detail route should not list the list route as its parent unless nesting is
intentional.

## Do Work

Use this workflow when implementing a feature, fixing a bug, or changing code.

1. Explore the relevant code before editing.
2. Read `CONTEXT.md` and relevant ADRs under `docs/adr/` when domain behavior is involved.
3. Keep the change scoped to the requested behavior.
4. Prefer existing project patterns over new abstractions.
5. Add focused tests when runtime behavior, business rules, or shared interfaces change.
6. Run the validation commands listed above.
7. Do not commit unless the user explicitly asks for a commit.

When the change touches database behavior, follow the DB TDD workflow below.

When the change touches complex frontend state, follow the Frontend State TDD workflow below.

## DB TDD

Use this when code interacts with the database, schema, repository functions, loaders/actions that persist data, or business rules backed by stored data.

Principles:

- Validate behavior through the interface the app uses.
- Prefer tests that exercise real queries against a test database over tests that assert implementation details.
- Do not test what TypeScript already proves.
- Focus tests on runtime behavior: ordering, relationships after mutation, constraints, conflict handling, and domain edge cases.
- Add one failing test at a time, make it pass, then continue.

The repo has a PostgreSQL test harness under `tests/db/`. Use
`npm run test:db` for database-backed behavior. The script creates the configured
test database when needed, pushes the Drizzle schema, and runs `*.db.test.ts`
with serial file execution.

For a focused DB test file during development, use:

```bash
npm run test:db:file -- app/lib/example.db.test.ts
```

Run the full `npm run test:db` command before finishing database-backed work.

## Frontend State TDD

Use this when creating or changing reducers, state machines, multi-step flows, or non-trivial derived state.

Workflow:

1. Extract complex state logic into a pure module.
2. Put tests next to that module.
3. Write one failing test for one transition or edge case.
4. Make it pass with the smallest implementation.
5. Repeat until the behavior is covered.
6. Refactor while tests stay green.
7. Wire the tested logic into the component.

Do not introduce `use-effect-reducer` just because the reference repo uses it. Use it only if the project has already adopted it or the current task explicitly adds it.

## Loader Optimization

Use this when writing or reviewing React Router loaders/actions that call the database or service layer.

Watch for:

- Re-fetching records the caller already loaded.
- Loading full nested data when the route only needs a slim projection.
- Running independent queries sequentially when they can be safely parallelized.
- Hiding expensive behavior behind helper functions with broad names.

Prefer slim query variants when a route only needs IDs, labels, status flags, or counts. Keep route loaders focused on data needed by that route.

## PRD Workflow

Use this when the user asks to turn a conversation, plan, or feature idea into a PRD.

1. Read `CONTEXT.md` and relevant ADRs.
2. Explore the current code enough to avoid proposing stale or incompatible work.
3. Ask for clarification only when a reasonable assumption would create meaningful product or architecture risk.
4. Write the PRD as a GitHub issue in `leomontigatti/en-escena`.
5. Do not add implementation labels automatically.

PRD template:

```markdown
## Problem Statement

## Solution

## User Stories

## Implementation Decisions

## Testing Decisions

## Out of Scope

## Further Notes
```

The PRD should be concrete enough for a later agent to break into implementation issues without re-deriving core decisions.

## Issue Breakdown Workflow

Use this when the user asks to break a PRD into implementation issues.

1. Fetch the PRD with `gh issue view <number> --comments`.
2. Confirm whether implementation issues already exist for that PRD.
3. Draft a flat, ordered list of vertical slices.
4. Review the proposed slices with the user before creating issues.
5. Create GitHub issues only after approval.

Slice rules:

- Each issue should deliver a narrow but complete path through the stack.
- Each issue should be independently verifiable.
- Prefer vertical slices over horizontal layer-only tasks.
- Put prefactoring first when it makes later slices simpler.
- Keep each issue small enough for one focused agent session.

Issue body template:

```markdown
## Parent PRD

#<PRD_NUMBER>

## What to build

## Acceptance criteria

- [ ] Concrete, checkable outcome
- [ ] Tests cover the new behavior

## Depends on
```

## Architecture Review Workflow

Use this when the user asks to find architecture improvements.

1. Read existing architecture-related issues first so proposals are not duplicates.
2. Read `CONTEXT.md` and relevant ADRs.
3. Look for one high-leverage opportunity, not a list of cosmetic refactors.
4. Prefer changes that increase locality, reduce repeated domain knowledge, or create a clearer test surface.
5. Publish as a PRD only if the user asks to publish.

Useful filters:

- If deleting a module would make complexity disappear, it may be shallow.
- If deleting a module would spread complexity into callers, it may be earning its interface.
- If callers must know too many invariants, the interface may not be deep enough.
- If tests can only cover internals, the public interface may be wrong.
