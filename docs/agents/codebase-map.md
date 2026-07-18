# Codebase Map

Operational map for agents moving from a product flow to the files that usually
matter. Use this after `CONTEXT.md`, the relevant ADRs and `docs/domain/`.

This file is intentionally compact. It is not a full dependency graph and should
only list stable entry points, coordination modules and high-signal tests.

## Code Placement

- `app/routes` files are thin React Router entrypoints. Keep long-lived table,
  form, modal and loader/action implementation in feature or lib modules.
- Feature folders under `app/features` own product experiences:
  route-level views, route loaders/actions, request and form parsing, redirects,
  pending state, UI copy and flow-specific tests. Prefer surface-first folders
  such as `admin/categories` and `portal/choreographies`.
- Domain folders under `app/lib` own reusable behavior behind small interfaces: domain
  rules, persistence modules, access policy, storage adapters and cross-surface
  orchestration. A module in `app/lib/categories/` should not depend on admin
  route action types, redirects, notifications or feature route paths.
- Inside `app/lib`, prefer filenames that name the capability or interface they
  expose, such as `registration-resolution.server.ts`,
  `dancer-records.server.ts`, `verification.ts` or `category-identity.ts`.
  Avoid growing catch-all files like `categories.server.ts` with unrelated
  route actions, form parsing and domain rules.
- `app/lib/admin/` and `app/lib/portal/` are allowed for reusable behavior
  that is still specific to one product surface. Do not create them as mirrors
  of every feature folder.
- `Bases del evento` is domain vocabulary for modalidades, categorias,
  cronogramas, cupos and precios. In code, prefer concrete resource names for
  feature modules and use `event-bases`/`bases` names only for aggregators that
  genuinely coordinate several of those resources.
- For Bases del evento persistence, prefer resource-level interfaces for new
  callers: `app/lib/categories/`, `app/lib/modalities/`,
  `app/lib/schedules/` and `app/lib/prices/`. Existing
  `app/lib/events/bases-repository/` modules may stay as implementation or
  compatibility facades during migration. Callers that need several resources
  coordinated should use `app/lib/events/bases.server.ts`.
- Migrate existing code incrementally. When changing a vertical, choose the
  owner first, then extract only a small interface. Keep legacy aggregators in
  place while they still coordinate several resources, and avoid moving whole
  files into `app/lib` if they still depend on route actions, feature paths,
  redirects, notification helpers or UI copy.

## Public Academy Registration

Use for public academy signup, Supabase email confirmation and pending academy
onboarding.

- Domain: `docs/domain/acceso.md`
- ADRs: `docs/adr/0005-use-supabase-postgres-before-supabase-auth.md`, `docs/adr/0006-use-supabase-auth-for-access.md`
- Local operation: `docs/local-auth.md`
- Routes: `app/routes/registro.tsx`, `app/routes/registro_.confirmar.tsx`, `app/routes/registro_.academia.tsx`, `app/routes/registro_.error-confirmacion.tsx`
- Server modules: `app/lib/academies/registration.server.ts`, `app/lib/academies/registration-auth.server.ts`, `app/lib/academies/onboarding.server.ts`, `app/lib/academies/onboarding-maintenance.server.ts`
- Auth modules: `app/lib/auth/send-email-hook.server.ts`, `app/lib/auth/supabase-auth-ssr.server.ts`, `app/lib/auth/internal-navigation.server.ts`
- Tests: `app/lib/academies/registration.server.db.test.ts`, `app/lib/academies/onboarding.server.db.test.ts`, `app/lib/academies/onboarding-maintenance.server.db.test.ts`, `app/lib/auth/registration-confirmation-route.server.test.ts`, `app/lib/auth/send-email-hook.server.test.ts`

## Access And Internal Users

Use for login, session policy, password recovery, mandatory password changes,
internal invitations, suspension and internal user administration.

- Domain: `docs/domain/acceso.md`
- ADRs: `docs/adr/0003-direct-internal-user-access.md`, `docs/adr/0006-use-supabase-auth-for-access.md`
- Local operation: `docs/local-auth.md`
- Routes: `app/routes/ingresar.tsx`, `app/routes/recuperar-acceso.tsx`, `app/routes/recuperar-acceso_.nueva.tsx`, `app/routes/cambiar-contrasena.tsx`, `app/routes/invitacion_.$token.tsx`, `app/routes/salir.tsx`, `app/routes/administracion.usuarios.tsx`, `app/routes/administracion.usuarios_.nuevo.tsx`, `app/routes/administracion.usuarios_.$userId.tsx`, `app/routes/administracion.usuarios_.invitaciones.tsx`
- Feature modules: `app/features/admin/users/list/`, `app/features/admin/users/detail/`
- Server modules: `app/lib/auth/internal-access.server.ts`, `app/lib/auth/internal-login.server.ts`, `app/lib/auth/access-recovery.server.ts`, `app/lib/auth/mandatory-password-change.server.ts`, `app/lib/admin/users/internal-user-create.server.ts`, `app/lib/admin/users/internal-user-update.server.ts`, `app/lib/admin/users/internal-user-suspension.server.ts`, `app/lib/admin/users/user-invitation.server.ts`
- Tests: `app/lib/auth/auth-session-policy.server.db.test.ts`, `app/lib/auth/access-recovery.server.db.test.ts`, `app/lib/auth/mandatory-password-change-route.server.db.test.ts`, `app/lib/auth/logout-route.server.db.test.ts`, `app/lib/admin/users/users-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create.server.db.test.ts`, `app/lib/admin/users/user-invitation.server.db.test.ts`, `app/lib/admin/users/user-detail-route.server.db.test.ts`

## Portal Roster

Use for the academy roster: academy-owned professors, dancers, dancer
verification and document image storage.

- Domain: `docs/domain/coreografias.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`, `docs/adr/0008-use-supabase-storage-for-uploaded-assets.md`
- Routes: `app/routes/portal.profesores.tsx`, `app/routes/portal.profesores_.$professorId.tsx`, `app/routes/portal.bailarines.tsx`, `app/routes/portal.bailarines_.$dancerId.tsx`, `app/routes/portal.perfil.tsx`
- Feature modules: `app/features/portal/professors/list/`, `app/features/portal/professors/create/`, `app/features/portal/professors/detail/`, `app/features/portal/dancers/list/`, `app/features/portal/dancers/create/`, `app/features/portal/dancers/detail/`, `app/features/portal/profile/`
- Server modules: `app/lib/portal/professors.server.ts`, `app/lib/portal/professor-records.server.ts`, `app/features/portal/professors/list/server.ts`, `app/features/portal/professors/create/server.ts`, `app/features/portal/professors/detail/server.ts`, `app/features/portal/dancers/list/server.ts`, `app/features/portal/dancers/create/server.ts`, `app/features/portal/dancers/detail/server.ts`, `app/features/portal/profile/server.ts`, `app/features/portal/profile/academy-profile.server.ts`, `app/lib/portal/dancers.server.ts`, `app/lib/dancers/dancer-records.server.ts`, `app/lib/dancers/verification.ts`, `app/lib/storage/dancer-documents.server.ts`
- UI modules: `app/features/portal/professors/list/view.tsx`, `app/features/portal/professors/create/dialog.tsx`, `app/features/portal/professors/detail/view.tsx`, `app/features/portal/dancers/list/view.tsx`, `app/features/portal/dancers/create/dialog.tsx`, `app/features/portal/dancers/detail/view.tsx`, `app/features/portal/dancers/detail/form.tsx`, `app/features/portal/profile/view.tsx`
- Tests: `app/features/portal/roster/view-transitions.render.test.tsx`, `app/features/portal/profile/server.db.test.ts`, `app/features/portal/profile/view.test.tsx`, `app/features/portal/profile/action.test.ts`, `app/features/portal/professors/create/dialog.test.tsx`, `app/features/portal/professors/create/submission.test.tsx`, `app/features/portal/professors/list/server.db.test.ts`, `app/features/portal/professors/list/view.test.tsx`, `app/features/portal/professors/detail/view.test.tsx`, `app/features/portal/dancers/create/dialog.test.tsx`, `app/features/portal/dancers/create/submission.test.tsx`, `app/features/portal/dancers/list/server.db.test.ts`, `app/features/portal/dancers/list/view.test.tsx`, `app/features/portal/dancers/detail/server.db.test.ts`, `app/features/portal/dancers/detail/view.test.tsx`, `app/features/portal/dancers/detail/submission.test.tsx`, `app/features/portal/dancers/detail/server.test.ts`, `app/lib/storage/dancer-documents.server.test.ts`

## Portal Shell

Use for the academy portal layout, shell-wide academy identity, active event
summary, breadcrumbs, navigation, and cross-portal access policy.

- Domain: `docs/domain/acceso.md`, `docs/domain/eventos.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.tsx`, `app/routes/portal._index.tsx`
- Feature modules: `app/features/portal/shell/`
- Server modules: `app/features/portal/shell/server.ts`, `app/lib/portal/event-context.server.ts`
- UI modules: `app/features/portal/shell/view.tsx`, `app/components/portal/ui.tsx`
- Tests: `app/features/portal/shell/server.db.test.ts`, `app/features/portal/shell/view.test.tsx`, `app/lib/portal/event-context.server.test.ts`

## Portal Coreografias

Use for choreography lists, registration, detail edits, roster links, locks,
schedule resolution and operational completion.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/finanzas.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.coreografias.tsx`, `app/routes/portal.coreografias_.crear.tsx`, `app/routes/portal.coreografias_.$choreographyId.tsx`
- Feature modules: `app/features/portal/choreographies/list/`, `app/features/portal/choreographies/create/`, `app/features/portal/choreographies/detail/`
- Server modules: `app/features/portal/choreographies/list/server.ts`, `app/features/portal/choreographies/create/server.ts`, `app/lib/portal/choreographies.server.ts`, `app/features/portal/choreographies/detail/server.ts`, `app/lib/choreographies/registration-resolution.server.ts`, `app/lib/choreographies/registration-confirmation.server.ts`
- UI modules: `app/features/portal/choreographies/list/view.tsx`, `app/features/portal/choreographies/create/dialog.tsx`, `app/features/portal/choreographies/detail/view.tsx`, `app/features/portal/choreographies/detail/music-editor-form.tsx`
- Tests: `app/features/portal/choreographies/detail/server.db.test.ts`, `app/lib/choreographies/registration-resolution.server.db.test.ts`, `app/lib/choreographies/registration-confirmation.server.db.test.ts`, `app/features/portal/choreographies/list/server.db.test.ts`, `app/features/portal/choreographies/create/flow.test.ts`, `app/features/portal/choreographies/request-flow.render.test.tsx`, `app/features/portal/choreographies/detail/view.test.tsx`

## Admin Shell And Dashboard

Use for the Panel de administración shell, dashboard entry points, shared
breadcrumbs/navigation and active event selector wiring.

- Domain: `docs/domain/acceso.md`, `docs/domain/eventos.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.tsx`, `app/routes/administracion._index.tsx`
- Feature modules: admin leaf routes stay under `app/features/admin/`; the shell itself stays route-owned because it coordinates nested matches and the shared layout contract.
- Shared UI modules: `app/components/admin/shell.tsx`, `app/components/admin/resource-layout.tsx`
- Shared server modules: `app/lib/admin/event-context.server.ts`, `app/lib/events/registration-readiness.server.ts`
- Audit note: `app/components/admin` remains the stable home for shell/layout primitives and event-bases widgets. Do not move admin feature screens into this folder.
- Tests: `app/lib/admin/admin-dashboard-route.server.db.test.ts`, `app/lib/admin/route.render.test.tsx`, `app/components/admin/shell.test.tsx`, `app/components/admin/resource-layout.test.tsx`, `app/lib/auth/private-header.render.test.tsx`

## Admin Users

Use for internal user list, create, detail, invitations, suspension and
password reset flows.

- Domain: `docs/domain/acceso.md`
- ADRs: `docs/adr/0003-direct-internal-user-access.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.usuarios.tsx`, `app/routes/administracion.usuarios_.nuevo.tsx`, `app/routes/administracion.usuarios_.$userId.tsx`, `app/routes/administracion.usuarios_.invitaciones.tsx`
- Feature modules: `app/features/admin/users/list/`, `app/features/admin/users/create/`, `app/features/admin/users/detail/`, `app/features/admin/users/invitations/`
- Shared modules kept in `app/lib` because they stay neutral to several admin flows: `app/lib/admin/users/users-list.server.ts`, `app/lib/admin/users/internal-user-create.server.ts`, `app/lib/admin/users/internal-user-update.server.ts`, `app/lib/admin/users/internal-user-suspension.server.ts`, `app/lib/admin/users/internal-user-password-reset.server.ts`, `app/lib/admin/users/internal-user-credentials.server.ts`, `app/lib/admin/users/internal-user-credentials.shared.ts`, `app/lib/admin/users/user-invitation.server.ts`, `app/lib/auth/internal-navigation.server.ts`
- Shared UI still reused by the feature views: `app/lib/admin/users/user-detail-cards.tsx`, `app/lib/admin/users/user-detail-edit-form.tsx`, `app/lib/admin/users/user-detail-password-reset-form.tsx`, `app/lib/admin/users/user-detail-role-field.tsx`
- Tests: `app/lib/admin/users/users-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create.server.db.test.ts`, `app/lib/admin/users/user-detail-route.server.db.test.ts`, `app/lib/admin/users/internal-invitation-route.server.db.test.ts`, `app/lib/admin/users/user-invitation.server.db.test.ts`, `app/features/admin/users/list/view.test.tsx`, `app/features/admin/users/create/view.test.tsx`

## Admin Choreographies

Use for the operational admin list of coreografías for the active event.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/finanzas.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.coreografias.tsx`
- Feature modules: `app/features/admin/choreographies/list/`
- Shared modules: `app/lib/admin/choreographies/` stays as the persistence and filter boundary because it is still useful beyond the route adapter.
- Tests: `app/features/admin/choreographies/list/server.db.test.ts`, `app/features/admin/choreographies/list/view.test.tsx`, `app/lib/admin/choreographies/choreographies-route.server.db.test.ts`, `app/lib/admin/choreographies/choreographies-route-filters.server.db.test.ts`

## Admin Roster

Use for administration and audit views over profesores, bailarines,
participation filters, archive/reactivate flows and admin corrections.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/acceso.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.profesores.tsx`, `app/routes/administracion.profesores_.$professorId.tsx`, `app/routes/administracion.bailarines.tsx`, `app/routes/administracion.bailarines_.$dancerId.tsx`
- Feature modules: `app/features/admin/professors/list/`, `app/features/admin/professors/detail/`, `app/features/admin/dancers/list/`, `app/features/admin/dancers/detail/`
- Shared modules kept in `app/lib` because they encapsulate reusable query, mutation and audit behavior: `app/lib/admin/professors/professors.server.ts`, `app/lib/admin/professors/professors.shared.ts`, `app/lib/admin/dancers/dancers.server.ts`, `app/lib/admin/dancers/dancers-list.server.ts`, `app/lib/admin/dancers/dancers-detail.server.ts`, `app/lib/admin/dancers/dancers-update.server.ts`, `app/lib/admin/dancers/dancers-audit.server.ts`, `app/lib/admin/dancers/dancers-inscriptions.server.ts`, `app/lib/admin/dancers/dancers-identity.server.ts`, `app/lib/admin/dancers/dancers-active-state.server.ts`, `app/lib/admin/dancers/dancers-mutation-helpers.server.ts`, `app/lib/participation/participation.server.ts`
- Tests: `app/features/admin/dancers/routes.adapter.test.tsx`, `app/features/admin/professors/list/view.test.tsx`, `app/features/admin/professors/detail/view.test.tsx`, `app/lib/admin/professors/professors-route.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.server.db.test.ts`, `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`, `app/lib/admin/dancers/inscriptions-section.render.test.tsx`

## Admin Events And Bases Del Evento

Use for active event behavior, event CRUD, modalidades, categorías,
cronogramas, cupos, precios and registration readiness.

- Domain: `docs/domain/eventos.md`, `docs/domain/coreografias.md`, `docs/domain/finanzas.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.eventos.tsx`, `app/routes/administracion.eventos_.nuevo.tsx`, `app/routes/administracion.eventos_.$eventId.tsx`, `app/routes/administracion.modalidades.tsx`, `app/routes/administracion.modalidades_.nueva.tsx`, `app/routes/administracion.modalidades_.$modalityId.tsx`, `app/routes/administracion.categorias.tsx`, `app/routes/administracion.categorias_.nueva.tsx`, `app/routes/administracion.categorias_.$categoryId.tsx`, `app/routes/administracion.cronogramas.tsx`, `app/routes/administracion.cronogramas_.nuevo.tsx`, `app/routes/administracion.cronogramas_.$scheduleId.tsx`, `app/routes/administracion.precios.tsx`, `app/routes/administracion.precios_.nuevo.tsx`, `app/routes/administracion.precios_.$priceId.tsx`
- Feature modules: `app/features/admin/events/list/`, `app/features/admin/events/create/`, `app/features/admin/events/detail/`, `app/features/admin/modalities/`, `app/features/admin/categories/`, `app/features/admin/schedules/`, `app/features/admin/prices/`
- Shared admin modules kept because they still provide neutral contracts used by several admin event features: `app/lib/admin/event-context.server.ts`, `app/lib/admin/events/bases-action/runner.server.ts`, `app/lib/admin/events/bases-action/modalities.server.ts`, `app/lib/admin/events/bases-action/categories.server.ts`, `app/lib/admin/events/bases-action/schedules.server.ts`, `app/lib/admin/events/bases-action/prices.server.ts`, `app/lib/admin/events/bases-action/shared.server.ts`, `app/lib/admin/events/bases-action/input.server.ts`
- Shared domain modules that remain cross-surface: `app/lib/events/management.server.ts`, `app/lib/events/bases.server.ts`, `app/lib/categories/repository.server.ts`, `app/lib/modalities/repository.server.ts`, `app/lib/schedules/repository.server.ts`, `app/lib/prices/repository.server.ts`, `app/lib/events/registration-readiness.server.ts`
- Admin event-bases UI lives with each feature module: `app/features/admin/modalities/`, `app/features/admin/categories/`, `app/features/admin/schedules/`, and `app/features/admin/prices/`.
- High-signal feature UI entry points: `app/features/admin/schedules/list/view.tsx`, `app/features/admin/schedules/detail/view.tsx`, `app/features/admin/prices/list/view.tsx`, `app/features/admin/prices/detail/view.tsx`
- Test helpers: `app/lib/admin/events/event-bases.test-helpers.tsx`
- Tests: `app/features/admin/events/routes.adapter.test.tsx`, `app/features/admin/modalities/routes.adapter.test.tsx`, `app/features/admin/categories/routes.adapter.test.tsx`, `app/features/admin/schedules/routes.adapter.test.tsx`, `app/features/admin/prices/routes.adapter.test.tsx`, `app/lib/admin/event-context.server.test.ts`, `app/lib/admin/events/events-route.server.db.test.ts`, `app/lib/admin/events/event-detail-route.server.db.test.ts`, `app/lib/admin/events/event-bases-overview-modalities.server.db.test.ts`, `app/lib/admin/events/event-bases-categories.server.db.test.ts`, `app/lib/admin/events/event-bases-prices.server.db.test.ts`, `app/lib/admin/events/event-bases-validation.server.db.test.ts`, `app/lib/admin/events/event-bases-cronogramas.server.db.test.ts`, `app/lib/events/management.server.db.test.ts`, `app/lib/events/bases.server.test.ts`, `app/lib/events/bases-repository-catalog.server.db.test.ts`, `app/lib/events/bases-repository-schedules.server.db.test.ts`, `app/lib/events/bases-repository-prices.server.db.test.ts`, `app/lib/events/bases-repository-capacities.server.db.test.ts`, `app/lib/events/registration-readiness.server.db.test.ts`

## Judging And Results

Use for judge panel access, presentations, scores, disqualifications, ranking,
program and results visibility.

- Domain: `docs/domain/juzgamiento.md`, `docs/domain/eventos.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/juzgamiento.tsx`, `app/routes/auditoria.tsx`
- Current state: shell routes and access guards exist; most judging domain rules are documented ahead of deeper implementation.
- Tests: `app/lib/auth/internal-navigation.server.db.test.ts`, `app/lib/auth/internal-navigation.server.test.ts`, `app/lib/auth/private-header.render.test.tsx`

## Cross-Cutting Validation

- Run route/type validation with `pnpm typecheck`, never `pnpm exec tsc`.
- Use `pnpm test:db <path>` for focused persistence work; `pnpm test` (unit + PGlite DB) is the default confidence command and needs no local Postgres. Real Postgres is `pnpm test:db:postgres`, reserved for the CI gate (#305).
- Use `pnpm check:repo-styles` after UI changes.
- Use `pnpm check:file-tokens` before committing staged application source.
- Performance notes live in `docs/agents/request-performance-baseline.md` and `docs/agents/request-performance-refactor-plan.md`.
