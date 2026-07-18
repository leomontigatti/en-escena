# Workflows

Project-local workflows for agents working on En Escena.

These workflows adapt useful ideas from `mattpocock/course-video-manager` to this repo. They are repo instructions for Claude Code and other agents that read `CLAUDE.md`.

## Investigate before implementing

When the user asks to investigate, review, diagnose, audit, analyze, or explain
something, do not implement changes automatically. Return findings, relevant
context, options or tradeoffs, and a recommended next step, then wait for the
user to explicitly ask for implementation before editing files.

Start implementing right away only when the user clearly asks to implement, fix,
apply changes, or make the change.

## Command Guardrail

Use `pnpm typecheck` for type validation.

Do not run `pnpm exec tsc` directly. `pnpm typecheck` runs `react-router typegen && tsc --noEmit`, so generated route types are present before TypeScript checks the app. A PreToolUse hook (`.claude/hooks/block-npx-tsc.sh`, wired in `.claude/settings.json`) enforces this: it blocks `npx tsc` / `pnpm exec tsc` / `pnpm dlx tsc` and points back here.

When reading React Router flat-route files with shell commands, quote paths that
contain `$` segments so the shell does not expand route params. For example, use
`sed -n '1,220p' 'app/routes/administracion.eventos_.$eventId.tsx'`.

Formatting commands:

- `pnpm format` runs `prettier --write .` and changes files in place.
- `pnpm format:check` runs `prettier --check .` and only verifies that the
  repo is already formatted.

Do not run both as a required pair during normal development. Run
`pnpm format` when you want the repo formatted, then continue with the next
validation command. Use `pnpm format:check` for final verification, CI-style
checks, or when formatting is already handled by a pre-commit hook such as
`lint-staged`.

Recommended final validation after code changes:

1. `pnpm format:check` when formatting was not just applied with
   `pnpm format`
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm typecheck`
4. `pnpm test` when the change affects runtime behavior, shared modules,
   route behavior, UI behavior with meaningful regression risk, database
   schema, repositories, loaders/actions that persist data, or
   persistence-backed business rules. `pnpm test` runs the unit/react suite
   and the DB suite on in-process PGlite, so it needs no local Postgres.
5. `pnpm build` when the change touches routing, server rendering, bundling,
   CSS, or deployment behavior

If a command fails, fix that failure and rerun the same command before moving to
the next one. Do not start a later validation command while an earlier command is
still failing or while formatting changes are unverified.

Run `pnpm typecheck` and `pnpm build` sequentially, never in parallel.
`pnpm build` cleans and regenerates `build/`, while TypeScript can include
generated files from that directory during `pnpm typecheck`; running both at the
same time can produce transient TS6053 missing-file errors that do not represent
application failures.

Hook guidance:

- Keep pre-commit hooks fast and deterministic. Formatting staged files through
  `lint-staged` is appropriate.
- The pre-commit hook runs `lint-staged`, `pnpm typecheck`, and
  `pnpm check:file-tokens`. Treat that as the minimum commit gate, not as the
  only validation path for agent work. Hooks can be skipped and may not run in
  every environment.
- `pnpm check:file-tokens` is a staged-source commit gate, not a required
  validation command after every implementation. Run it before committing
  staged application source, before a PR handoff that depends on staged files,
  or while working on a file-size refactor.
- Prefer running `pnpm typecheck` explicitly before finishing. This command
  must stay as `pnpm typecheck`, not `pnpm exec tsc`, because it generates React
  Router route types before TypeScript runs.

During the development loop, prefer focused validation for the area being
changed before running the broader final checks:

- Run `pnpm check:repo-styles` when the change adds or edits app UI code.
  This repo-style check blocks hardcoded Tailwind color scales and `space-x/y-*`
  utilities in application source, while keeping explicit coded exceptions for
  intentional patterns such as the overlapping `AvatarGroup`.
- `pnpm check:file-tokens` is a strict file-token check for staged
  application source files, so it belongs to the commit or PR-handoff path
  rather than every normal implementation pass. It fails when a staged `app`
  module is above `5500` estimated tokens (`bytes / 4`). Refactor at a clear
  module boundary before committing instead of adding a large staged file. Run
  it earlier only when the change is likely to push a touched app file over the
  threshold or when validating a file-size refactor.
- Run the nearest relevant Vitest file or test name for small non-database
  changes, then run `pnpm test` before finishing when the change affects
  runtime behavior, shared modules, route behavior, or UI behavior with
  meaningful regression risk.
- Use `pnpm test:db <path-to-db-test>` while iterating on database
  schema, repositories, loaders/actions that persist data, or
  persistence-backed business rules. This runs the fast in-process PGlite
  harness against a single file.
- Run `pnpm test` before finishing when the change affects runtime behavior,
  shared modules, route behavior, UI behavior, schema, or persistence-backed
  business rules. It covers the unit/react suite and the DB suite on PGlite,
  and `pnpm build` for routing, server rendering, bundling, CSS, or deployment
  behavior.
- Do not use focused runs as the only final validation when the change touches
  a shared interface, cross-surface behavior, schema, or persistence-backed
  business rule.

`pnpm test` and `pnpm test:db` run on in-process PGlite and need no local
Postgres, so the AFK implementer and reviewer can run them on a GHA runner with
no Postgres service. Real Postgres is the high-fidelity path
`pnpm test:db:postgres`, reserved for the CI gate on the PR (#305) and manual
fidelity checks. For Codex sessions inside the managed sandbox, that path still
needs elevated local permission because `TEST_DATABASE_URL` points at Postgres
over TCP on `localhost:5433`. When requesting persistent approval, use these
scoped prefixes:

- `pnpm test:db:postgres`
- `pnpm db:test:push`
- `docker compose up -d postgres` when the local Postgres container must be
  started for the session

This approval is operational only; it does not change the reliable validation
target. `pnpm test:db:postgres` must continue to use `TEST_DATABASE_URL`,
not production or preview data.

## React Router Flat Routes

This repo uses `@react-router/fs-routes` flat route naming. When adding a
dedicated form or detail route under a list URL, make the form/detail route a
sibling of the list route unless the list component intentionally renders an
`<Outlet />`.

Use a trailing underscore on the list segment in child filenames to avoid
accidental parent/child nesting:

- List: `administracion.eventos.tsx`
- Detail sibling: `administracion.eventos_.$eventId.tsx`
- New-form sibling: `administracion.eventos_.nuevo.tsx`

Do not use `administracion.eventos.$eventId.tsx` or
`administracion.eventos.nuevo.tsx` unless
`administracion.eventos.tsx` renders `<Outlet />`. Without an outlet,
the child route matches but the user keeps seeing the parent list instead of the
detail or form screen.

After adding or renaming route files, run `pnpm typecheck` and inspect
`.react-router/types/+routes.ts` when route parentage matters. The target
form/detail route should not list the list route as its parent unless nesting is
intentional.

## App Code Placement

Keep React Router files in `app/routes` as thin route entrypoints. A route file
should own route metadata and adaptation only:

- `meta`
- `handle`
- `loader` and `action` functions that delegate to feature/server modules
- the default route component that wires route data/search params to a feature
  view
- route-only re-exports used by existing tests

Do not use route files as the long-term home for table definitions, modal flows,
form controllers, loader/action business logic, or route-local helper clusters.
When a route grows past simple adaptation, move the implementation behind a
feature module.

Use `app/features/<surface>/<feature>/<flow>/` for product-surface workflows
that belong to one area of the app. The first established pattern is:

```text
app/features/portal/choreographies/
|-- list/
|   |-- server.ts
|   `-- view.tsx
|-- create/
|   |-- server.ts
|   |-- flow.ts
|   |-- dialog.tsx
|   `-- ...
`-- detail/
    |-- server.ts
    |-- view.tsx
    |-- music-editor-form.tsx
    `-- ...
```

Inside a feature flow:

- Use `server.ts` for route loader/action implementation, route-specific
  orchestration, and request/form parsing.
- Use `view.tsx` for the route-level screen view when the folder name already
  supplies the context (`list/view.tsx`, `detail/view.tsx`).
- Use specific filenames for substantial submodules, such as
  `music-editor-form.tsx`, `flow.ts`, `fields.tsx`, or
  `formatters.ts`.
- Co-locate focused tests with the module they exercise when the behavior is
  feature-specific.

Use `app/lib/<domain>` for domain-neutral modules whose interface is useful
across product surfaces. Do not move a module from `app/lib` into a feature
only because one route imports it today. Keep modules such as choreography
registration resolution, event bases, auth/session policy, and storage adapters
in `app/lib` when their behavior is not owned by one product surface.

Use `app/components/ui` for shadcn/ui primitives and `app/components/shared`
for reusable cross-surface UI primitives. Avoid placing feature-specific screens,
dialogs, tables, or form flows in `app/components/shared`; keep those inside the
feature folder until at least two product surfaces need the same module through
a small stable interface.

Use English for code filenames, folder names, symbols, and technical module
names. Keep Spanish for user-facing UI copy, route path segments that are part
of the product URL contract, and canonical domain vocabulary documented in
`CONTEXT.md`.

## Portal Layout Routes

The academy portal intentionally uses a React Router layout route:

- `portal.tsx` owns `PortalShell`, loads shell-wide data, and renders
  `<Outlet />`.
- `portal._index.tsx` owns the `/portal` dashboard content.
- Portal child screens render only their screen content. Do not render
  `PortalShell` again from `portal.profesores.tsx`,
  `portal.bailarines.tsx`, `portal.coreografias.tsx`, detail routes, or other
  portal children.
- List/detail routes that should share the portal shell but not nest inside the
  list component use trailing-underscore sibling filenames:
  `portal.profesores_.$professorId.tsx`,
  `portal.bailarines_.$dancerId.tsx`, and
  `portal.coreografias_.$choreographyId.tsx`.
- Child loaders/actions still call `requireAcademyUser(request)` for
  authorization, even when they do not need shell data in their return value.
- Portal breadcrumbs come from `handle.portalBreadcrumbs` on child routes and
  are collected by `getPortalBreadcrumbItems(matches)` in `portal.tsx`.

Do not reintroduce `portal.profesores.$professorId.tsx`,
`portal.bailarines.$dancerId.tsx`, or
`portal.coreografias.$choreographyId.tsx` unless the corresponding list route
renders an `<Outlet />`; otherwise React Router will match a child URL while the
screen keeps rendering the list.

## Admin Layout Routes

The Panel de administración also uses a React Router layout route:

- `administracion.tsx` owns `AdminShell`, loads shell-wide user and Evento
  activo context, and renders `<Outlet />`.
- `administracion._index.tsx` owns the `/administracion` dashboard content.
- Administration child screens render only screen content. Do not render
  `AdminShell` again from `administracion.profesores.tsx`,
  `administracion.bailarines.tsx`, `administracion.eventos.tsx`,
  `administracion.usuarios.tsx`, detail routes, or event-base children.
- Administration route metadata comes from `handle.adminBreadcrumbs` and
  `handle.adminShell`. Collect it in `administracion.tsx` with
  `getAdminBreadcrumbItems(matches)` and `getAdminShellOptions(matches)`.
- Use `handle.adminShell.showEventSelector = false` for global user-management
  screens that should not show the active-event summary.
- List/detail/form routes that should share the administration shell but not
  nest inside the list component use trailing-underscore sibling filenames:
  `administracion.profesores_.$professorId.tsx`,
  `administracion.bailarines_.$dancerId.tsx`,
  `administracion.eventos_.$eventId.tsx`,
  `administracion.eventos_.nuevo.tsx`,
  `administracion.modalidades_.$modalityId.tsx`,
  `administracion.modalidades_.nueva.tsx`,
  `administracion.categorias_.$categoryId.tsx`,
  `administracion.categorias_.nueva.tsx`,
  `administracion.cronogramas_.$scheduleId.tsx`,
  `administracion.cronogramas_.nuevo.tsx`,
  `administracion.precios_.$priceId.tsx`,
  `administracion.precios_.nuevo.tsx`,
  `administracion.usuarios_.$userId.tsx`, and
  `administracion.usuarios_.nuevo.tsx`.

After adding or renaming administration route files, run `pnpm typecheck`
and inspect `.react-router/types/+routes.ts` when parentage matters. Child
administration routes should list `administracion` as their layout parent, and
list/detail/form routes should stay siblings of the list route unless the list
intentionally renders an outlet.

Do not reintroduce `administracion.eventos.$eventId.tsx`,
`administracion.eventos.nuevo.tsx`,
`administracion.usuarios.$userId.tsx`, or
`administracion.usuarios.nuevo.tsx` unless the corresponding list route renders
an `<Outlet />`; otherwise React Router will match the child URL while the
screen keeps rendering the list.

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

The repo has two DB validation paths:

- `pnpm test:db` is the default suite. It runs `*.db.test.ts` on the
  in-process PGlite harness with a cached schema snapshot, needs no local
  Postgres, and is included in `pnpm test`. Pass a path to focus a single
  file: `pnpm test:db <path>`.
- `pnpm test:db:postgres` is the high-fidelity path. It creates the configured
  test database when needed, pushes the Drizzle schema, and runs `*.db.test.ts`
  against real Postgres through `TEST_DATABASE_URL`. Reserved for the CI gate
  on the PR (#305) and manual fidelity checks. Pass a path to focus a single
  file: `pnpm test:db:postgres <path>`.

For a focused DB test file during development, use:

```bash
pnpm test:db app/lib/example.db.test.ts
```

Use `pnpm test:db <path-to-db-test>` while iterating.
Run `pnpm test` before finishing work that must prove runtime, shared,
route, UI, schema, or persistence-backed behavior; it covers the unit and
PGlite DB suites.
When you need real Postgres for fidelity comparison, run
`pnpm test:db:postgres <path-to-db-test>`.

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

## Request Performance and Loading

Use this when a route, form, table, or navigation path feels slow.

Measure before diagnosing latency. Do not start with "the VPS is far from
Supabase" or "React Router is slow" until you have loader or action timing
around the real route seam.

Measure loader or action timing around the real route seam and separate the
major layers that can hide inside one request:

- auth
- event/context lookup
- main query or mutation
- serialization/readiness work
- revalidation follow-up

Record the route id, intent, and whether the request came from navigation,
`useSubmit`, `fetcher.submit`, or a native `<Form>` path. If a request triggers
revalidation, measure the follow-up loader separately instead of blaming the
original action for the whole wait.

Check duplicate work before deeper optimization:

- A layout loader and child loader both fetching the same event context.
- Independent queries running sequentially instead of in parallel.
- Loader helpers returning more nested data than the route renders.
- RHF forms validating in React and then calling `form.submit()` into a second
  full route cycle.

Current form-submit standard:

- RHF forms validate on the client and then submit through React Router, not
  through `form.submit()` or `HTMLFormElement.prototype.submit()`.
- Use `useSubmit` for route submissions that should navigate or redirect.
- Use `useFetcher.submit` for submissions that should keep the current route,
  modal, or dialog mounted on recoverable errors.
- Shared RHF + React Router submit helpers should pass `FormData`, not
  `Record<string, string>`, so repeated fields, arrays, checkboxes, and file
  inputs survive the abstraction.

Use `docs/agents/request-performance-refactor-plan.md` as the current route
inventory, submit-pattern inventory, and measurement starting point for this
refactor family. Keep it discoverable from child issues and update it when the
baseline assumptions materially change.

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
2. Confirm whether implementation issues already exist for that PRD, starting with native GitHub sub-issues from `gh issue view <number> --json subIssues,subIssuesSummary` and then checking body links or comments as a fallback.
3. Draft a flat, ordered list of vertical slices.
4. Review the proposed slices with the user before creating issues.
5. Create GitHub issues only after approval. Use `gh issue create --parent <PRD_NUMBER>` so each implementation issue is a native sub-issue of the PRD.

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
