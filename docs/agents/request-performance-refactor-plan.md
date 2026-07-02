# Request Performance Refactor Plan

Revalidation baseline for PRD #130 before child implementation starts.

Permanent implementation rules now live in:

- `docs/agents/codex-workflows.md` for measurement workflow and validation entrypoints
- `docs/agents/style-guide.md` for pending/loading/View Transition guidance
- `docs/agents/coding-standards.md` for maintainable file-boundary guidance

## Current Validation Workflow

Confirmed against `docs/agents/codex-workflows.md`, `package.json`, and
`docs/local-auth.md`.

Final validation order for this refactor:

1. `pnpm format` when formatting needs to be applied, otherwise
   `pnpm format:check` for final formatting verification
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm check:file-tokens`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm test:db` for database-backed route, loader, action, repository, or
   business-rule changes
7. `pnpm build` for routing, server-rendering, bundling, CSS, or deployment
   changes

Implementation guardrails that still matter for this PRD:

- `pnpm typecheck` remains the required TypeScript entrypoint because it runs
  React Router type generation before `tsc`.
- `pnpm check:file-tokens` is the strict staged-file module-boundary check.
- `pnpm test:db:file <path-to-db-test>` is the fast focused DB loop.
- `pnpm test:db` is the final reliable database-backed validation path.
- `pnpm test:db:fast:full` remains experimental and is not the final signoff
  command.

## Critical Administración Routes

Layout and shared event context:

- `app/routes/administracion.tsx`
- `app/lib/admin/event-context.server.ts`

Current high-value request paths for this refactor:

- `app/routes/administracion.eventos.tsx`
  Event list loader plus readiness fan-out per row.
- `app/routes/administracion.eventos_.$eventId.tsx`
  Event edit action path and readiness loader.
- `app/routes/administracion.eventos_.nuevo.tsx`
  Event creation form/action path.
- `app/routes/administracion.modalidades.tsx`
- `app/routes/administracion.modalidades_.$modalityId.tsx`
- `app/routes/administracion.modalidades_.nueva.tsx`
- `app/routes/administracion.categorias.tsx`
- `app/routes/administracion.categorias_.$categoryId.tsx`
- `app/routes/administracion.categorias_.nueva.tsx`
- `app/routes/administracion.cronogramas.tsx`
- `app/routes/administracion.cronogramas_.$scheduleId.tsx`
- `app/routes/administracion.cronogramas_.nuevo.tsx`
- `app/routes/administracion.precios.tsx`
- `app/routes/administracion.precios_.$priceId.tsx`
- `app/routes/administracion.precios_.nuevo.tsx`

Routes that currently reload admin event context in addition to the layout and
should stay in the measurement set:

- `app/routes/administracion.bailarines.tsx`
- `app/routes/administracion.bailarines_.$dancerId.tsx`
- `app/routes/administracion.profesores.tsx`
- `app/routes/administracion.profesores_.$professorId.tsx`

## Critical Portal Routes

Layout and shared event context:

- `app/routes/portal.tsx`
- `app/lib/portal/event-context.server.ts`

Current high-value request paths for this refactor:

- `app/routes/portal.bailarines.tsx`
  List loader plus create dialog action.
- `app/routes/portal.bailarines_.$dancerId.tsx`
  Detail/edit action path.
- `app/routes/portal.profesores.tsx`
  List loader plus create dialog action.
- `app/routes/portal.profesores_.$professorId.tsx`
  Detail/edit action path.
- `app/routes/portal.coreografias.tsx`
  List loader plus create flow with calculation and submission fetchers.
- `app/routes/portal.coreografias_.$choreographyId.tsx`
  Detail/edit flow with `shouldRevalidate`, resolution fetcher, and mutation
  actions.
- `app/routes/portal.perfil.tsx`
  RHF-backed profile form migrated to React Router `useSubmit`.

Routes that currently reload portal event context in addition to the layout and
should stay in the measurement set:

- `app/routes/portal.bailarines.tsx`
- `app/routes/portal.profesores.tsx`
- `app/routes/portal.coreografias.tsx`
- `app/routes/portal.coreografias_.$choreographyId.tsx`

## Current Submit Patterns

Current patterns are mixed. The repo has not yet converged on one React
Router-native form path.

Native React Router `<Form>` without RHF helper:

- Auth and access flows such as `app/routes/ingresar.tsx`,
  `app/routes/registro.tsx`, `app/routes/registro_.$token.tsx`,
  `app/routes/recuperar-acceso.tsx`, `app/routes/cambiar-contrasena.tsx`, and
  `app/routes/invitacion_.$token.tsx`
- `app/routes/administracion.usuarios_.$userId.tsx` also includes a plain
  `<Form method="post">` path alongside RHF-backed submits

RHF validation followed by native `form.submit()`:

- `app/lib/shared/forms.ts`
  `createValidatedNativeSubmitHandler` still ends in `formElement.submit()`
- `app/routes/administracion.usuarios_.$userId.tsx`
- `app/routes/administracion.profesores_.$professorId.tsx`
- `app/routes/administracion.bailarines_.$dancerId.tsx`

Migrated RHF + React Router submit patterns:

- `app/components/auth/access-form.tsx`
  Auth forms validate with RHF and submit through React Router.
- `app/components/admin/events/form.tsx`
- `app/features/admin/modalities/route-views.tsx`
- `app/features/admin/categories/form.tsx`
- `app/features/admin/schedules/route-views.tsx`
- `app/features/admin/prices/route-views.tsx`
- `app/routes/administracion.usuarios_.nuevo.tsx`
- `app/routes/portal.bailarines.tsx`
- `app/routes/portal.bailarines_.$dancerId.tsx`
- `app/routes/portal.profesores.tsx`
- `app/routes/portal.profesores_.$professorId.tsx`
- `app/routes/portal.perfil.tsx`

Submit helper standard:

- RHF-backed forms should not call `form.submit()` after validation.
- Use `useSubmit` when the route should preserve navigation or redirect
  semantics.
- Use `useFetcher.submit` when the current screen, modal, or dialog should stay
  mounted.
- Shared RHF + React Router submit helpers should pass `FormData`, not
  `Record<string, string>`, to preserve repeated fields, arrays, checkboxes and
  future file inputs.

React Router `useFetcher` / `fetcher.submit` patterns already present:

- `app/routes/portal.coreografias.tsx`
  uses separate calculation and submission fetchers
- `app/routes/portal.coreografias_.$choreographyId.tsx`
  uses a resolution fetcher and skips full revalidation for that intent via
  `shouldRevalidate`

Implication for child issues:

- The PRD assumption that native submit patterns still exist remains true for
  the remaining administration user/professor/dancer detail gaps.
- New or touched RHF forms should use the migrated React Router submit standard
  above instead of copying the remaining legacy native-submit paths.
- Preserve `useSubmit` versus `useFetcher.submit` intentionally because not all
  forms want navigation after submit.

## View Transition Evaluation

Navigation map after the request-flow and pending-state fixes from PRD #130:

- `Portal / Bailarines`: list -> detail and detail -> list should animate.
  This path has a stable record name on both screens and the navigation changes
  context without replacing the persistent shell.
- `Portal / Profesores`: list -> detail and detail -> list should animate.
  This has the same continuity signal as `Bailarines`.
- `Portal / Coreografías`: list -> detail should not animate.
  The destination is an editing surface dominated by mutable roster state,
  operational alerts, and resolver-driven pending feedback instead of a stable
  shared visual target.
- `Portal / Bailarines` create dialog and `Portal / Profesores` create dialog
  should not animate with View Transitions.
  They are local dialog toggles, not route navigations, so regular dialog
  motion remains the clearer default.
- `Portal / Coreografías` create flow should not animate with View Transitions.
  The stepper and deferred calculations already communicate progress, and a
  route transition would only mask request work.
- `Administración` list/detail and Bases del evento routes should not animate.
  Those screens sit under persistent shells with dense operational forms, so a
  route-wide transition would add motion without improving continuity.

Implementation decision for issue #142:

- Keep View Transitions scoped to `Portal / Bailarines` and
  `Portal / Profesores` list-detail navigation only.
- Do not add a root or shell-level route transition.
- Use an explicit shared-element transition name with a 160ms default and
  reduced-motion fallback.

## Revalidated Assumptions

Still true:

- `app/routes/administracion.tsx` loads shell-wide email plus active event
  context, and child admin routes still load additional route data below it.
- `app/routes/portal.tsx` loads shell-wide academy plus event context, and key
  portal child routes still query event context again inside their own
  loaders/actions.
- Critical performance seams are still React Router loaders and actions, not a
  separate client-side data layer.
- `portal.coreografias` is still the most advanced React Router-native submit
  surface and remains the best reference route for later migrations.

Changed or stale versus PRD #130:

- The local plan file referenced by PRD #130 did not exist. This document now
  becomes the repo-local source of truth for the pre-implementation inventory.
- The PRD points to a generic local plan reference, but the repo now needs this
  explicit route and submit inventory before issues #132 onward start.
- The repo has a stronger DB validation split than the PRD text implied:
  focused iteration uses `pnpm test:db:file <path-to-db-test>`, while
  final database-backed validation uses `pnpm test:db`.
- `docs/agents/codex-workflows.md` now standardizes the regular test command as
  `pnpm test` for consistency with the repo task contract and the rest of
  the documented `pnpm ...` workflow.

Decisions for child issues:

- Use this file plus PRD #130 as the starting point for issues #132 onward.
- Keep administration event configuration, portal create flows, and
  event-context deduplication as separate measurement/migration tracks.
- Do not assume every RHF form should move to `useFetcher`; preserve
  `useSubmit` or `<Form>` navigation semantics where redirect-on-success is the
  intended behavior.
