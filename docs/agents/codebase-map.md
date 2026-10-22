# Codebase Map

Operational map for agents moving from a product flow to the files that usually
matter. Use this after `GLOSSARY.md`, the relevant ADRs and `docs/domain/`.

This file is intentionally compact. It is not a full dependency graph and should
only list stable entry points, coordination modules and high-signal tests.

## Code Placement

- `app/routes` files are thin React Router entrypoints. A route file owns `meta`,
  `handle`, a `loader` and `action` that delegate to feature or server modules, the
  default component that wires route data and search params to a feature view, and
  route-only re-exports existing tests use. Table definitions, modal flows, form
  controllers, loader/action business logic and helper clusters live behind a
  feature module once a route grows past that.
  A route with an `action` and a UI also exports a `clientAction` delegating to
  `recoverableClientAction`, so an unexpected failure keeps the view mounted; see
  [form-feedback.md](form-feedback.md#unexpected-failures-during-a-submit).
- Feature folders under `app/features`, shaped `<surface>/<feature>/<flow>/`, own product
  experiences: route-level views, route loaders/actions, request and form parsing,
  redirects, pending state, UI copy and flow-specific tests. Prefer surface-first
  folders such as `admin/categories` and `portal/choreographies`. Inside a flow,
  `server.ts` holds the loader/action implementation and request parsing,
  `view.tsx` the route-level screen where the folder name supplies the context
  (`list/view.tsx`, `detail/view.tsx`), and a substantial submodule gets a specific
  name (`music-editor-form.tsx`, `flow.ts`, `fields.tsx`). Feature-specific tests
  sit beside the module they exercise.
- Domain folders under `app/lib` own reusable behavior behind small interfaces: domain
  rules, persistence modules, access policy, storage adapters and cross-surface
  orchestration. A module in `app/lib/categories/` should not depend on admin
  route action types, redirects, notifications or feature route paths. A module
  whose behaviour no single surface owns stays in `app/lib` even when one route
  imports it today.
- Inside `app/lib`, prefer filenames that name the capability or interface they
  expose, such as `registration-resolution.server.ts`,
  `dancer-records.server.ts`, `verification.ts` or `category-identity.ts`.
  Avoid growing catch-all files like `categories.server.ts` with unrelated
  route actions, form parsing and domain rules.
- `app/lib/admin/` and `app/lib/portal/` are allowed for reusable behavior
  that is still specific to one product surface. Do not create them as mirrors
  of every feature folder.
- `app/components/ui` holds the shadcn/ui primitives and `app/components/shared`
  reusable cross-surface UI. Feature-specific screens, dialogs, tables and form
  flows stay in their feature folder until two product surfaces need the same
  module through a small stable interface.
- `Bases del evento` is domain vocabulary for modalities, categories,
  schedules, capacities and prices. In code, prefer concrete resource names for
  feature modules and use `event-bases`/`bases` names only for aggregators that
  genuinely coordinate several of those resources.
- `Bases del evento` persistence has one owner per resource, each entered
  through the `repository.server.ts` in its directory: `app/lib/modalities/`
  (modalities and submodalities), `app/lib/categories/`, `app/lib/schedules/`
  (schedules and their capacities) and `app/lib/prices/`. What every resource shares
  —result and failure types, entity-kind copy, name rules, the executor types
  and the referencing-choreography guard— lives in the kernel
  `app/lib/events/bases-kernel.server.ts`; a resource's own inputs, list items
  and queries stay with its owner. Callers that need several resources
  coordinated use the aggregator `app/lib/events/bases.server.ts`.
- Migrate existing code incrementally. When changing a vertical, choose the
  owner first, then extract only a small interface. Keep legacy aggregators in
  place while they still coordinate several resources, and avoid moving whole
  files into `app/lib` if they still depend on route actions, feature paths,
  redirects, notification helpers or UI copy.

## Routes and layouts

Routes use `@react-router/fs-routes` flat naming. A detail or form route under a
list URL is a **sibling** of the list route, marked by a trailing underscore on
the list segment: list `administracion.eventos.tsx`, detail
`administracion.eventos_.$eventId.tsx`, form `administracion.eventos_.nuevo.tsx`.
Nest it (`administracion.eventos.$eventId.tsx`) only when the list renders an
`<Outlet />`; without one the child URL matches while the screen keeps rendering
the list. After adding or renaming a route file, run `pnpm typecheck` and read
`.react-router/types/+routes.ts`: a sibling does not list the list route as its
parent, and every child of a shell lists the shell. Quote a route path with a
`$` segment in the shell (`sed -n '1,220p' 'app/routes/administracion.eventos_.$eventId.tsx'`)
so it does not expand the param.

The portal and the `Panel de administración` are layout routes:

- `portal.tsx` owns `PortalShell` and `administracion.tsx` owns `AdminShell`; each
  loads its shell-wide data (the admin's includes the active Event context) and
  renders `<Outlet />`. `portal._index.tsx` and `administracion._index.tsx` own
  the dashboards.
- Child screens render only their content, never the shell again.
- Child loaders and actions still authorize themselves (`requireAcademyUser(request)`
  in the portal), even when they need no shell data.
- Breadcrumbs come from `handle.portalBreadcrumbs` and `handle.adminBreadcrumbs`
  on child routes, collected in the layout by `getPortalBreadcrumbItems(matches)`
  and `getAdminBreadcrumbItems(matches)`. `handle.adminShell` carries the admin
  shell's options, read by `getAdminShellOptions(matches)`; a global
  user-management screen sets `handle.adminShell.showEventSelector = false`.
- Each layout exports the `ErrorBoundary` that renders a child's error inside the
  shell (`app/components/shared/error-panel.tsx`), so child routes export none.
  A `handle` breadcrumb function tolerates `match.data` being `undefined`, since
  it runs for the failed child too.

## Public Academy Registration

Use for public academy signup, email confirmation and pending academy
onboarding.

- Domain: `docs/domain/access.md`
- ADRs: `docs/adr/0013-exit-supabase.md`
- Local operation: `docs/local-auth.md`
- Routes: `app/routes/registro.tsx`, `app/routes/registro_.confirmar.tsx`, `app/routes/registro_.academia.tsx`, `app/routes/registro_.error-confirmacion.tsx`
- Server modules: `app/lib/academies/registration.server.ts`, `app/lib/academies/registration-auth.server.ts`, `app/lib/academies/onboarding.server.ts`, `app/lib/academies/onboarding-maintenance.server.ts`
- Auth modules: `app/lib/auth/access-auth-emails.server.ts`, `app/lib/auth/legacy-session-cookies.server.ts`, `app/lib/auth/internal-navigation.server.ts`
- Tests: `app/lib/academies/registration.server.db.test.ts`, `app/lib/academies/onboarding.server.db.test.ts`, `app/lib/academies/onboarding-maintenance.server.db.test.ts`, `app/lib/auth/registration-confirmation-route.server.test.ts`, `app/lib/auth/access-auth-emails.server.test.ts`

## Individual Area

Use for the `individual` (`Particular`) account: its onboarding, its own area,
its personal data and its link to academy rosters, which administration confirms
from its `Particulares` admin section (ADR-0019).

- Domain: `docs/domain/access.md`
- ADRs: `docs/adr/0019-individual-owns-its-own-pool.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/registro_.cuenta.tsx` (the kind choice), `app/routes/registro_.particular.tsx`, `app/routes/particular.tsx` (layout), `app/routes/particular._index.tsx`, `app/routes/particular.perfil.tsx`, `app/routes/particular.coreografias.tsx`, `app/routes/particular.seminarios.tsx`, `app/routes/particular.finanzas.tsx`, `app/routes/administracion.particulares.tsx`, `app/routes/administracion.particulares_.$individualId.tsx`
- Feature modules: `app/features/individual/onboarding/` (the kind choice and the individual's onboarding form), `app/features/individual/shell/`, `app/features/individual/personal-data/`, `app/features/individual/choreographies/` (`Coreografías`: the active event's choreographies the link reaches, results behind the academies' publication gate; `certificate/`, its own certificate PDF), `app/features/individual/seminars/` (`Seminarios`: the active event's seminars with what each costs the individual, its own registration and removal through the seminar inscription service), `app/features/individual/finances/` (`Finanzas › Seminarios`: the portal's finance summary over the individual's owner row), `app/features/individual/payments/` (`Finanzas › Pagos`: its payments under the event's `Instrucciones de pago`), `app/features/admin/individuals/list/`, `app/features/admin/individuals/detail/` (the individual's data, photo and `Confirmar vínculo` / `Revocar vínculo`), `app/features/admin/individuals/link-review-badge.tsx` (administration's `Incompleto` / `Sin verificar` / `Vinculado`)
- Server modules: `app/lib/individuals/onboarding.server.ts`, `app/lib/individuals/personal-data.ts` (the personal data schema and normalization, shared by onboarding and `Perfil`), `app/lib/individuals/personal-data.server.ts`, `app/lib/individuals/link-state.ts` (the derived `Sin vincular` / `Pendiente` / `Vinculado`), `app/lib/individuals/link.server.ts` (the link module: the roster rows an individual reaches and the individuals reaching a row, only while `Vinculado`, and the confirmation and revocation), `app/lib/auth/pending-onboarding.server.ts`, `requireIndividualUser` in `app/lib/auth/internal-access.server.ts`
- Schema: `app/db/schema/individuals.ts`; the owner row is `academy` of kind `individual` (`app/lib/academies/owner-kind.server.ts`)
- Tests: `app/lib/individuals/onboarding.server.db.test.ts`, `app/features/individual/shell/server.db.test.ts`, `app/features/individual/personal-data/server.db.test.ts`, `app/features/individual/choreographies/server.db.test.ts`, `app/features/individual/seminars/server.db.test.ts`, `app/features/individual/finances/server.db.test.ts`, `app/features/individual/payments/server.db.test.ts`, `app/lib/finances/individual-seminar-money.server.db.test.ts`, `app/lib/individuals/link.server.db.test.ts`, `app/features/admin/individuals/list/server.db.test.ts`, `app/features/admin/individuals/detail/server.db.test.ts`

## Access And Internal Users

Use for login, session policy, password recovery,
suspension and internal user administration.

- Domain: `docs/domain/access.md`
- ADRs: `docs/adr/0003-direct-internal-user-access.md`, `docs/adr/0013-exit-supabase.md`
- Local operation: `docs/local-auth.md`
- Routes: `app/routes/ingresar.tsx`, `app/routes/recuperar-acceso.tsx`, `app/routes/recuperar-acceso_.nueva.tsx`, `app/routes/cambiar-contrasena.tsx`, `app/routes/salir.tsx`, `app/routes/administracion.usuarios.tsx`, `app/routes/administracion.usuarios_.nuevo.tsx`, `app/routes/administracion.usuarios_.$userId.tsx`
- Feature modules: `app/features/admin/users/list/`, `app/features/admin/users/detail/`
- Server modules: `app/lib/auth/internal-access.server.ts`, `app/lib/auth/internal-login.server.ts`, `app/lib/auth/access-recovery.server.ts`, `app/lib/admin/users/internal-user-create.server.ts`, `app/lib/admin/users/internal-user-update.server.ts`, `app/lib/admin/users/internal-user-suspension.server.ts`
- Tests: `app/lib/auth/auth-session-policy.server.db.test.ts`, `app/lib/auth/access-recovery.server.db.test.ts`, `app/lib/auth/change-password-route.server.test.ts`, `app/lib/auth/logout-route.server.db.test.ts`, `app/lib/admin/users/users-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create.server.db.test.ts`, `app/lib/admin/users/user-detail-route.server.db.test.ts`

## Portal Roster

Use for the academy roster: academy-owned professors, dancers, dancer
verification and document image storage.

- Domain: `docs/domain/choreographies.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`, `docs/adr/superseded/0008-use-supabase-storage-for-uploaded-assets.md`
- Routes: `app/routes/portal.profesores.tsx`, `app/routes/portal.profesores_.nuevo.tsx`, `app/routes/portal.profesores_.$professorId.tsx`, `app/routes/portal.bailarines.tsx`, `app/routes/portal.bailarines_.nuevo.tsx`, `app/routes/portal.bailarines_.$dancerId.tsx`, `app/routes/portal.perfil.tsx`
- Feature modules: `app/features/portal/professors/list/`, `app/features/portal/professors/create/`, `app/features/portal/professors/detail/`, `app/features/portal/dancers/list/`, `app/features/portal/dancers/create/`, `app/features/portal/dancers/detail/`, `app/features/portal/profile/`
- Server modules: `app/lib/portal/professors.server.ts`, `app/lib/professors/professor-records.server.ts`, `app/features/portal/professors/list/server.ts`, `app/features/portal/professors/create/server.ts`, `app/features/portal/professors/detail/server.ts`, `app/features/portal/dancers/list/server.ts`, `app/features/portal/dancers/create/server.ts`, `app/features/portal/dancers/detail/server.ts`, `app/features/portal/profile/server.ts`, `app/lib/academies/academy-profile.server.ts`, `app/lib/portal/dancers.server.ts`, `app/lib/roster/identity-document.ts` (the owner of the `Documento de identidad`: normalization, form refinement, presence, printing and the formatted-DNI search term, for dancers and professors on both surfaces), `app/lib/roster/roster-person-search.ts` (what a roster list is searched by, with its SQL twin in `roster-person-search.server.ts`), `app/lib/shared/person-name.ts` (the Spanish person-name rule), `app/lib/dancers/dancer-records.ts` (dancer name and birth date normalization, shared with the forms), `app/lib/dancers/dancer-records.server.ts`, `app/lib/dancers/verification.ts` (the owner of `Estado de verificación de bailarín`, with its SQL twin in `verification.server.ts`), `app/lib/storage/dancer-documents.server.ts`
- UI modules: `app/features/portal/professors/list/view.tsx`, `app/features/portal/professors/create/page.tsx`, `app/features/portal/professors/detail/view.tsx`, `app/features/portal/professors/detail/form.tsx`, `app/features/portal/dancers/list/view.tsx`, `app/features/portal/dancers/create/page.tsx`, `app/features/portal/dancers/detail/view.tsx`, `app/features/portal/dancers/detail/form.tsx`, `app/features/portal/profile/view.tsx`
- Tests: `app/features/portal/profile/server.db.test.ts`, `app/features/portal/profile/action.test.ts`, `app/features/portal/professors/create/page.test.tsx`, `app/features/portal/professors/create/server.db.test.ts`, `app/features/portal/professors/list/server.db.test.ts`, `app/features/portal/professors/list/view.test.tsx`, `app/features/portal/professors/detail/view.test.tsx`, `app/features/portal/dancers/create/server.db.test.ts`, `app/features/portal/dancers/list/server.db.test.ts`, `app/features/portal/dancers/list/view.test.tsx`, `app/features/portal/dancers/detail/server.db.test.ts`, `app/features/portal/dancers/detail/view.test.tsx`, `app/features/portal/dancers/detail/submission.test.tsx`, `app/features/portal/dancers/detail/server.test.ts`, `app/lib/storage/dancer-documents.server.test.ts`

## Portal Shell

Use for the academy portal layout, shell-wide academy identity, active event
summary, breadcrumbs, navigation, and cross-portal access policy.

- Domain: `docs/domain/access.md`, `docs/domain/events.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.tsx`, `app/routes/portal._index.tsx`
- Feature modules: `app/features/portal/shell/`
- Server modules: `app/features/portal/shell/server.ts`, `app/lib/portal/event-context.server.ts`
- UI modules: `app/features/portal/shell/view.tsx`, `app/components/portal/ui.tsx`
- Tests: `app/features/portal/shell/server.db.test.ts`, `app/features/portal/shell/view.test.tsx`, `app/lib/portal/event-context.server.test.ts`

## Portal Choreographies

Use for choreography lists, registration, detail edits, roster links, locks,
schedule resolution and operational completion.

- Domain: `docs/domain/choreographies.md`, `docs/domain/events.md`, `docs/domain/finances.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.coreografias.tsx`, `app/routes/portal.coreografias_.crear.tsx`, `app/routes/portal.coreografias_.$choreographyId.tsx`
- Feature modules: `app/features/portal/choreographies/list/`, `app/features/portal/choreographies/create/`, `app/features/portal/choreographies/detail/`
- Server modules: `app/features/portal/choreographies/list/server.ts`, `app/features/portal/choreographies/create/server.ts`, `app/lib/portal/choreographies.server.ts`, `app/features/portal/choreographies/detail/server.ts`, `app/lib/choreographies/registration-resolution.server.ts`, `app/lib/choreographies/registration-confirmation.server.ts`
- UI modules: `app/features/portal/choreographies/list/view.tsx`, `app/features/portal/choreographies/create/page.tsx`, `app/features/portal/choreographies/create/steps.tsx`, `app/features/portal/choreographies/detail/view.tsx`, `app/features/portal/choreographies/detail/music-editor-form.tsx`
- Tests: `app/features/portal/choreographies/detail/server.db.test.ts`, `app/lib/choreographies/registration-resolution.server.db.test.ts`, `app/lib/choreographies/registration-confirmation.server.db.test.ts`, `app/features/portal/choreographies/list/server.db.test.ts`, `app/features/portal/choreographies/create/flow.test.ts`, `app/features/portal/choreographies/create/server.db.test.ts`, `app/features/portal/choreographies/create/page.render.test.tsx`, `app/features/portal/choreographies/request-flow.render.test.tsx`, `app/features/portal/choreographies/detail/view.test.tsx`

## Portal Seminars

Use for the academy-facing seminar surfaces: the gallery of posters for the
active event's seminars, and the seminar detail each poster links to, which owns
the academy's own inscriptions, the registration dialog and the removal. The
seminar row and its administrative surfaces live in `Admin Seminars`, and the
seminar tab and read-only `(seminar, academy)` detail of the portal
`Resumen financiero` are under `app/features/portal/finances/`.

- Domain: `docs/domain/seminars.md`, `docs/domain/finances.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.seminarios.tsx`, `app/routes/portal.seminarios_.$seminarId.tsx`
- Feature modules: `app/features/portal/seminars/list/`, `app/features/portal/seminars/detail/`
- Shared feature modules: `app/features/portal/seminars/shared.ts`
- Domain modules: `app/lib/seminars/inscriptions.server.ts`, `app/lib/seminars/inscription-rosters.server.ts`, `app/lib/seminars/inscription-person.server.ts` (the inscription's person and owner academy, for every reader), `app/lib/seminars/registration-window.ts`, `app/lib/seminars/registration-refusals.ts`, `app/lib/seminars/inscription-withdrawal.server.ts`, `app/lib/seminars/linked-person-refusals.server.ts` (one person, one side: the refusals of a person registered from both sides once an individual is `Vinculado`)
- Tests: `app/lib/seminars/inscriptions.server.db.test.ts`, `app/lib/seminars/inscription-withdrawal.server.db.test.ts`, `app/lib/seminars/registration-window.test.ts`, `app/features/portal/seminars/list/server.db.test.ts`, `app/features/portal/seminars/list/view.test.tsx`, `app/features/portal/seminars/detail/server.db.test.ts`, `app/features/portal/seminars/detail/view.test.tsx`

## Admin Shell And Dashboard

Use for the `Panel de administración` shell, dashboard entry points, shared
breadcrumbs/navigation and active event selector wiring.

- Domain: `docs/domain/access.md`, `docs/domain/events.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.tsx`, `app/routes/administracion._index.tsx`
- Feature modules: admin leaf routes stay under `app/features/admin/`; the shell itself stays route-owned because it coordinates nested matches and the shared layout contract.
- Shared UI modules: `app/components/admin/shell.tsx`, `app/components/admin/resource-layout.tsx`
- Shared server modules: `app/lib/admin/event-context.server.ts`, `app/lib/events/registration-readiness.server.ts`
- Audit note: `app/components/admin` remains the stable home for shell/layout primitives and event-bases widgets. Do not move admin feature screens into this folder.
- Tests: `app/lib/admin/admin-dashboard-route.server.db.test.ts`, `app/lib/admin/route.render.test.tsx`, `app/components/admin/shell.test.tsx`, `app/lib/auth/private-header.render.test.tsx`

## Admin Users

Use for internal user list, create, detail, suspension and
password reset flows.

- Domain: `docs/domain/access.md`
- ADRs: `docs/adr/0003-direct-internal-user-access.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.usuarios.tsx`, `app/routes/administracion.usuarios_.nuevo.tsx`, `app/routes/administracion.usuarios_.$userId.tsx`
- Feature modules: `app/features/admin/users/list/`, `app/features/admin/users/create/`, `app/features/admin/users/detail/`
- Shared modules kept in `app/lib` because they stay neutral to several admin flows: `app/lib/admin/users/users-list.server.ts`, `app/lib/admin/users/internal-user-create.server.ts`, `app/lib/admin/users/internal-user-update.server.ts`, `app/lib/admin/users/internal-user-suspension.server.ts`, `app/lib/admin/users/internal-user-password-reset.server.ts`, `app/lib/admin/users/internal-user-credentials.server.ts`, `app/lib/admin/users/internal-user-credentials.shared.ts`, `app/lib/auth/internal-navigation.server.ts`
- Shared UI still reused by the feature views: `app/lib/admin/users/user-detail-cards.tsx`, `app/lib/admin/users/user-detail-edit-form.tsx`, `app/lib/admin/users/user-detail-password-reset-form.tsx`, `app/lib/admin/users/user-detail-role-field.tsx`
- Tests: `app/lib/admin/users/users-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create.server.db.test.ts`, `app/lib/admin/users/user-detail-route.server.db.test.ts`, `app/features/admin/users/list/view.test.tsx`, `app/features/admin/users/list/server.db.test.ts`

## Admin Choreographies

Use for the admin choreographies of the active event: the operational list and
the choreography detail under it.

- Domain: `docs/domain/choreographies.md`, `docs/domain/events.md`, `docs/domain/finances.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.coreografias.tsx` (list), `app/routes/administracion.coreografias_.$choreographyId.tsx` (detail)
- Feature modules: `app/features/admin/choreographies/list/`, `app/features/admin/choreographies/detail/`, `app/features/admin/choreographies/operational-status.server.ts` (the status the list labels each row with)
- Shared modules: `app/lib/choreographies/admin-paths.ts` builds every admin choreography address. `app/lib/admin/choreographies/` stays as the persistence and filter boundary because it is still useful beyond the route adapter.
- Tests: `app/features/admin/choreographies/list/server.db.test.ts`, `app/features/admin/choreographies/list/view.test.tsx`, `app/lib/admin/choreographies/choreographies-route.server.db.test.ts`, `app/lib/admin/choreographies/choreographies-route-filters.server.db.test.ts`

## Admin Roster

Use for administration and read-only views over professors, dancers,
participation filters, archive/reactivate flows and admin corrections.

- Domain: `docs/domain/choreographies.md`, `docs/domain/events.md`, `docs/domain/access.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.profesores.tsx`, `app/routes/administracion.profesores_.$professorId.tsx`, `app/routes/administracion.bailarines.tsx`, `app/routes/administracion.bailarines_.$dancerId.tsx`
- Feature modules: `app/features/admin/professors/list/`, `app/features/admin/professors/detail/`, `app/features/admin/dancers/list/`, `app/features/admin/dancers/detail/`
- Shared modules kept in `app/lib` because they encapsulate reusable query and mutation behavior: `app/lib/admin/professors/professors.server.ts`, `app/lib/admin/professors/professors.shared.ts`, `app/lib/admin/dancers/dancers.server.ts`, `app/lib/admin/dancers/dancers-list.server.ts`, `app/lib/admin/dancers/dancers-detail.server.ts`, `app/lib/admin/dancers/dancers-update.server.ts`, `app/lib/dancers/inscriptions.server.ts`, `app/lib/admin/dancers/dancers-identity.server.ts`, `app/lib/participation/participation.server.ts`, `app/lib/participation/participation.shared.ts`
- Tests: `app/lib/admin/professors/professors-route.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.list.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.update.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.roster-status.server.db.test.ts`, `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`, `app/lib/admin/dancers/inscriptions-section.render.test.tsx`

## Admin Academies

Use for the administrative academy listing and the academy detail, where an
admin consults and edits the academy contact data. The per-academy financial
summary lives in `Admin Finances`, not here.

- Domain: `docs/domain/access.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`, `docs/adr/0019-individual-owns-its-own-pool.md`
- Routes: `app/routes/administracion.academias.tsx`, `app/routes/administracion.academias_.$academyId.tsx`
- Feature modules: `app/features/admin/academies/list/`, `app/features/admin/academies/detail/`
- Shared modules kept in `app/lib` because the update behavior is reused by the portal profile: `app/lib/academies/academy-profile.server.ts`
- Owner kind: an `academy` row is an academy or an `individual` (`academy.kind`). Every read that enumerates academies filters through `academyOwner()` in `app/lib/academies/owner-kind.server.ts`, except the money reads that serve both kinds (the finance list, the payment picker, the comprobantes list, the collection export; the first two label the kind through `app/lib/academies/owner-kind.ts`), and roster creation refuses an individual through `requireAcademyOwner()` there.
- Tests: `app/lib/admin/academies/academy-detail-route.server.db.test.ts`, `app/features/admin/academies/list/server.db.test.ts`

## Admin Events And `Bases del evento`

Use for active event behavior, event CRUD, modalities, categories,
schedules, capacities, prices and registration readiness.

- Domain: `docs/domain/events.md`, `docs/domain/choreographies.md`, `docs/domain/finances.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.eventos.tsx`, `app/routes/administracion.eventos_.nuevo.tsx`, `app/routes/administracion.eventos_.$eventId.tsx`, `app/routes/administracion.modalidades.tsx`, `app/routes/administracion.modalidades_.nueva.tsx`, `app/routes/administracion.modalidades_.$modalityId.tsx`, `app/routes/administracion.categorias.tsx`, `app/routes/administracion.categorias_.nueva.tsx`, `app/routes/administracion.categorias_.$categoryId.tsx`, `app/routes/administracion.cronogramas.tsx`, `app/routes/administracion.cronogramas_.nuevo.tsx`, `app/routes/administracion.cronogramas_.$scheduleId.tsx`, `app/routes/administracion.precios.tsx`, `app/routes/administracion.precios_.nuevo.tsx`, `app/routes/administracion.precios_.$priceId.tsx`
- Feature modules: `app/features/admin/events/list/`, `app/features/admin/events/create/`, `app/features/admin/events/detail/`, `app/features/admin/modalities/`, `app/features/admin/categories/`, `app/features/admin/schedules/`, `app/features/admin/prices/`
- Shared admin modules kept because they still provide neutral contracts used by several admin event features: `app/lib/admin/event-context.server.ts`, `app/lib/admin/events/bases-action/runner.server.ts`, `app/lib/admin/events/bases-action/modalities.server.ts`, `app/lib/admin/events/bases-action/categories.server.ts`, `app/lib/admin/events/bases-action/schedules.server.ts`, `app/lib/admin/events/bases-action/prices.server.ts`, `app/lib/admin/events/bases-action/shared.server.ts`, `app/lib/admin/events/bases-action/input.server.ts`
- Payment instructions (the event's bank identifiers and how-to-pay text, read by the portal payments page and the individual's `Pagos`): `app/lib/finances/bank-identifiers.ts`, the six `paymentInstructions*` fields of `app/lib/admin/events/form-values.ts`, the admin panel behind the event detail tabs: `app/features/admin/events/detail/payment-instructions-fields.tsx`, the reader-side mapping `app/lib/finances/payment-instructions.ts`, and the alert the portal payments page and the individual's `Pagos` show, `app/components/shared/payment-instructions-alert.tsx`
- Shared domain modules that remain cross-surface: `app/lib/events/management.server.ts`, `app/lib/events/bases.server.ts`, `app/lib/categories/repository.server.ts`, `app/lib/modalities/repository.server.ts`, `app/lib/schedules/repository.server.ts`, `app/lib/prices/repository.server.ts`, `app/lib/events/registration-readiness.server.ts`
- Admin event-bases UI lives with each feature module: `app/features/admin/modalities/`, `app/features/admin/categories/`, `app/features/admin/schedules/`, and `app/features/admin/prices/`.
- High-signal feature UI entry points: `app/features/admin/schedules/list/view.tsx`, `app/features/admin/schedules/detail/view.tsx`, `app/features/admin/prices/list/view.tsx`, `app/features/admin/prices/detail/view.tsx`
- Test helpers: `app/lib/admin/events/event-bases.test-support.tsx`
- Tests: `app/features/admin/schedules/view-shared.test.ts`, `app/features/admin/prices/routes.adapter.test.tsx`, `app/lib/admin/event-context.server.test.ts`, `app/lib/admin/events/events-route.server.db.test.ts`, `app/lib/admin/events/event-detail-route.server.db.test.ts`, `app/lib/admin/events/event-bases-overview-modalities.server.db.test.ts`, `app/lib/admin/events/event-bases-categories.server.db.test.ts`, `app/lib/admin/events/event-bases-prices.server.db.test.ts`, `app/lib/admin/events/event-bases-validation.server.db.test.ts`, `app/lib/admin/events/event-bases-cronogramas.server.db.test.ts`, `app/lib/events/management.server.db.test.ts`, `app/lib/events/bases.server.test.ts`, `app/lib/categories/repository.server.db.test.ts`, `app/lib/schedules/repository.server.db.test.ts`, `app/lib/prices/repository.server.db.test.ts`, `app/lib/schedules/repository-capacities.server.db.test.ts`, `app/lib/events/registration-readiness.server.db.test.ts`, `app/lib/finances/bank-identifiers.test.ts`, `app/lib/finances/payment-instructions.test.ts`, `app/lib/admin/events/form-values.test.ts`

## Admin Seminars

Use for the seminars an event offers around the competition: the seminar row,
the admin list, the create page, the detail with its `Información` and
`Inscriptos` tabs, the instructor's picture, the seminar's kind and its own
deposit rate, and the removal of an inscription.
Seminars are not part of the `Bases del evento` — registration readiness ignores
them and they have their own section under `Operación`. The event's seminar
price list, shared by every seminar of the event, is the `Seminarios` tab of the
`Precios` section (`app/features/admin/seminar-prices/`,
`app/lib/seminar-prices/`). The payment allocation and the comprobante line
already point at either kind of inscription — a choreography one or a seminar
one — through `app/lib/finances/allocation-target.server.ts`, which the pool
module takes as its target, and a seminar inscription's figures are derived on
read by `app/lib/finances/seminar-inscription-price.ts` and
`app/lib/finances/seminar-inscription-thresholds.server.ts`. Seminar money is
allocated from the academy's pool through the admin `(seminar, academy)`
financial detail, which opens the same money dialog choreographies do
(`app/features/admin/finances/inscription-money/`), and the quota is spent by
deposits rather than by registrations (`app/lib/seminars/covered-inscriptions.server.ts`).
Removal chooses between a delete and a withdrawal through
`app/lib/seminars/inscription-withdrawal.server.ts`, on both sides.
Seminar money is invoiced from the same `(seminar, academy)` detail: the
comprobante root carries a second **anchor** (`app/lib/comprobantes/anchor.ts`)
and the emitter is parameterised by it, so one emission path serves both kinds.
How the anchor **reads** is one module of its own
(`app/lib/comprobantes/anchor-reading.ts`, with the loader
`app/lib/comprobantes/anchor-context.server.ts`), shared by the printed
document, the comprobante detail and the global comprobante list, which holds
both kinds in one column and searches the instructor's name beside the
choreography's.

- Domain: `docs/domain/seminars.md`, `docs/domain/finances.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.seminarios.tsx`, `app/routes/administracion.seminarios_.nuevo.tsx`, `app/routes/administracion.seminarios_.$seminarId.tsx`
- Feature modules: `app/features/admin/seminars/list/`, `app/features/admin/seminars/create/`, `app/features/admin/seminars/detail/`
- Shared feature modules: `app/features/admin/seminars/shared.ts`, `app/features/admin/seminars/server.ts`, `app/features/admin/seminars/action.server.ts`, `app/features/admin/seminars/form.tsx`, `app/features/admin/seminars/list-table.tsx`, `app/features/admin/seminars/inscriptions-table.tsx`, `app/features/admin/seminars/actions.tsx`
- Domain modules: `app/lib/seminars/repository.server.ts`, `app/lib/seminars/inscriptions.server.ts`, `app/lib/seminars/inscription-rosters.server.ts`, `app/lib/seminars/registration-refusals.ts`, `app/lib/seminars/seminar-kinds.ts`, `app/lib/seminars/covered-inscriptions.server.ts`, `app/lib/seminars/active-inscription.ts`
- Schema: `app/db/schema/seminars.ts` (the seminar, its kind, the event's seminar price list and the seminar inscription, whose person is a dancer, a professor or an individual)
- Seminar money (price resolution, the two thresholds at the seminar's own rate, the covered predicate and the `(seminar, academy)` rollup): `app/lib/finances/seminar-inscription-price.ts`, `app/lib/finances/seminar-inscription-thresholds.server.ts`, `app/lib/finances/seminar-operational-summary.server.ts`, the participation set reader `app/lib/participation/participation.server.ts`, and the seminar participant cell `app/lib/finances/seminar-participation.server.ts` (an individual through the rows its link reaches)
- The allocation target (the kind and id an allocation points at, the columns it writes and the predicate it reads): `app/lib/finances/allocation-target.server.ts`, consumed by `app/lib/finances/allocation-pool.server.ts` and `app/lib/finances/choreography-cobro-allocations.server.ts`
- Seminar prices (the event-level list, its guards and its admin screens): routes `app/routes/administracion.precios_.seminarios_.nuevo.tsx` and `app/routes/administracion.precios_.seminarios_.$seminarPriceId.tsx`, feature modules `app/features/admin/seminar-prices/`, domain modules `app/lib/seminar-prices/repository.server.ts`, `app/lib/seminar-prices/participant-cells.ts`, the guards shared with the choreography price list `app/lib/prices/guards.ts`, and the action handler `app/lib/admin/events/bases-action/seminar-prices.server.ts`
- Seminar money allocation (the three gestures, keyed by the inscription alone, and the per-person price options of a `(seminar, academy)` unit or of the whole event): `app/lib/finances/seminar-inscription-allocation.server.ts`, `app/lib/finances/seminar-inscriptions.server.ts`, the shared action handler `app/features/admin/finances/inscription-money/seminar-money-action.server.ts`, route `app/routes/administracion.finanzas_.$academyId_.seminarios_.$seminarId.tsx`, feature module `app/features/admin/finances/academy-seminars/seminar-detail/`
- The admin seminar inscriptions finance list (every seminar inscription of the event across academies, under `Finanzas › Seminarios`, with the money dialog behind the person's name): route `app/routes/administracion.finanzas_.seminarios.tsx`, feature module `app/features/admin/finances/seminar-inscriptions/`
- The academy's seminar money (the `Coreografías` / `Seminarios` split of `Resumen financiero` and the read-only `(seminar, academy)` detail, the one portal surface that lists withdrawn rows): `app/features/portal/finances/view.tsx`, `app/features/portal/finances/server.ts`, route `app/routes/portal.finanzas_.seminarios_.$seminarId.tsx`, feature module `app/features/portal/finances/seminar-detail/`
- The place at the crossing (the covered and reserved places the quota is spent by, the reservation window, the refusal the crossing raises, and the payment-deletion impact that frees places): `app/lib/seminars/covered-inscriptions.server.ts`, `app/lib/seminars/seminar-reservations.ts`, `app/lib/seminars/registration-refusals.ts`, `app/features/admin/payments/detail/deletion-impact.server.ts`
- Removal with money (the delete-or-withdraw chooser both sides go through and the confirmation that says the money stays): `app/lib/seminars/inscription-withdrawal.server.ts`, `app/components/shared/withdraw-dialog.tsx`
- The shared money dialog (one dialog for both kinds of inscription, told which target it is about): `app/features/admin/finances/inscription-money/dialog.tsx`, `app/features/admin/finances/inscription-money/figures.ts`, `app/features/admin/finances/inscription-money/intents.ts`
- Seminar invoicing (the comprobante's second anchor, the per-unit advisory lock that serialises emission on it, the emitter parameterised by it, the plan that decides the owed document, and the one emission item both financial details share): `app/lib/comprobantes/anchor.ts`, `app/lib/comprobantes/anchor-lock.server.ts`, `app/lib/comprobantes/emit-comprobante.server.ts`, `app/lib/comprobantes/emission-plan.ts`, `app/lib/comprobantes/comprobantes.server.ts`, `app/features/admin/finances/comprobante-emission/shared.ts`, `app/features/admin/finances/comprobante-emission/handlers.server.ts`, `app/features/admin/finances/comprobante-emission/dialog.tsx`
- What an invoiced anchor's documents leave pending (the `Facturada` / `ND pendiente` / `NC pendiente` badge beside the payment one, the detail's alert and the 15-day clock, from the emitter's own delta), read for the academy's finance list and both financial details: `app/lib/comprobantes/anchor-billing.ts`, `app/lib/comprobantes/anchor-billing.server.ts`, `app/components/shared/billing-status-badge.tsx`, `app/features/admin/finances/comprobante-emission/pending-document-alert.tsx`; tests `app/lib/comprobantes/anchor-billing.test.ts`, `app/features/admin/finances/academy-choreographies/choreography-detail/server.invoicing.db.test.ts`, `app/features/admin/finances/academy-seminars/seminar-detail/server.db.test.ts`
- What the comprobante detail and its printed document load (the row, its named lines and the associated comprobante both ways, with #610's leyenda derived from the lines): `app/lib/comprobantes/comprobante-record.server.ts`, `app/lib/comprobantes/association.ts`; the short comprobante table the financial detail's tab and the invoice's `Ajustes` share: `app/features/admin/comprobantes/comprobantes-table.tsx`
- How a comprobante reads its anchor (one reading for both kinds, on the printed document, the detail and the global list): `app/lib/comprobantes/anchor-reading.ts`, `app/lib/comprobantes/anchor-context.server.ts`, `app/features/admin/comprobantes/print/model.ts`, `app/features/admin/comprobantes/print/server.ts`, `app/features/admin/comprobantes/list/server.ts`, `app/features/admin/comprobantes/list/view.tsx`, `app/features/admin/comprobantes/detail/server.ts`, `app/features/admin/comprobantes/detail/view.tsx`
- A unit's comprobantes (the `Inscripciones | Comprobantes (n)` tabs both financial details share, over every comprobante of one anchor): `app/features/admin/finances/anchor-comprobantes/server.ts`, `app/features/admin/finances/anchor-comprobantes/tabs.tsx`
- Storage module: `app/lib/storage/seminar-pictures.server.ts`
- Tests: `app/lib/comprobantes/anchor-reading.test.ts`, `app/features/admin/comprobantes/print/server.db.test.ts`, `app/features/admin/comprobantes/print/view.test.tsx`, `app/features/admin/comprobantes/list/server.db.test.ts`, `app/features/admin/comprobantes/list/view.test.tsx`, `app/features/admin/comprobantes/detail/server.db.test.ts`, `app/features/admin/comprobantes/detail/view.interaction.test.tsx`, `app/lib/comprobantes/emit-comprobante.seminar.server.db.test.ts`, `app/features/admin/finances/academy-seminars/seminar-detail/view.interaction.test.tsx`, `app/features/admin/finances/comprobante-emission/dialog.interaction.test.tsx`, `app/lib/seminars/inscription-withdrawal.server.db.test.ts`, `app/lib/finances/seminar-inscription-allocation.server.db.test.ts`, `app/features/admin/payments/detail/deletion-impact.server.db.test.ts`, `app/lib/seminars/inscriptions.server.db.test.ts`, `app/features/portal/seminars/list/server.db.test.ts`, `app/features/admin/finances/academy-seminars/seminar-detail/view.test.tsx`, `app/features/admin/finances/academy-seminars/seminar-detail/server.db.test.ts`, `app/features/admin/finances/anchor-comprobantes/tabs.interaction.test.tsx`, `app/features/portal/finances/seminar-detail/view.test.tsx`, `app/features/portal/finances/seminar-detail/server.db.test.ts`, `app/features/portal/finances/view.test.tsx`, `app/lib/finances/allocation-target.server.db.test.ts`, `app/lib/finances/seminar-inscription-price.test.ts`, `app/lib/finances/seminar-inscription-thresholds.server.db.test.ts`, `app/lib/seminars/active-inscription.db.test.ts`, `app/lib/seminar-prices/repository.server.db.test.ts`, `app/features/admin/seminar-prices/action.server.db.test.ts`, `app/features/admin/seminar-prices/view.test.tsx`, `app/lib/seminars/repository.server.db.test.ts`, `app/features/admin/seminars/action.server.db.test.ts`, `app/features/admin/seminars/action.server.picture.db.test.ts`, `app/features/admin/seminars/view.test.tsx`, `app/lib/storage/seminar-pictures.server.test.ts`

## Presentations

Use for the presentation order, the administrative participation list
(`Presentación`), judge assignment, the academy's presentations page on the
portal and the public program at `/programa`.

- Domain: `docs/domain/judging.md` ("Participation And Judging", and the program rules under "Ranking And Results"), `docs/domain/choreographies.md` ("Administrative Choreography Lists", "Choreography Locks")
- Glossary: `presentation`, `dancerSpacing`, `presentationWarning`, `judgeAssignment`, `choreographyParticipationList`, `eventProgram` in `GLOSSARY.md`
- Schema: `app/db/schema/presentations.ts` (the `presentation` table, whose unique constraint on event plus order number is `DEFERRABLE INITIALLY DEFERRED`, hand-written in `app/db/migrations/0025_cuddly_hairball.sql`, and the `judge_assignment` table, unique on the presentation and the judge)
- Routes: `app/routes/administracion.presentaciones.tsx` (the administrative participation list, `Presentaciones`), `app/routes/portal.presentaciones.tsx` (the academy's read-only `Presentaciones` page), `app/routes/programa.tsx` (the public program, the product's only unauthenticated content route)
- Modules: `app/lib/presentations/ordering.ts` (the pure block order, the dancer gap and moving a row by hand), `app/lib/presentations/warnings.ts` (the pure `Advertencia` derivation), `app/lib/presentations/evaluation-lock.server.ts` (the seam the choreography lock reads), `app/lib/presentations/music-file-name.ts` and `music-file-name.server.ts` (how a presentation's music file is named, alone from a choreography detail or in the day's `Descargar audios` archive, and the event's highest number it pads to), `app/lib/presentations/participation.server.ts` (the event's participation read, the automatic ordering and the move by hand), `app/lib/presentations/judge-assignments.server.ts` (the assignable judges, and the one function each way of the pair goes through), `app/features/admin/presentations/list/server.ts`, `app/features/admin/presentations/list/judge-dialogs.tsx`, `app/features/admin/presentations/list/shared.ts`, `app/features/admin/presentations/list/view.tsx`, `app/lib/presentations/academy-program.server.ts` (one academy's rows, and whether the event is ordered and its program published), `app/features/program/list.tsx` and `app/features/program/shared.ts` (the program list both non-administrative surfaces render), `app/features/portal/presentations/list/server.ts`, `app/features/portal/presentations/list/view.tsx`, `app/lib/presentations/event-program.server.ts` (the public program's read and the published active event), `app/lib/presentations/program-dancer-names.server.ts` (who dances, as both program surfaces name them), `app/features/program/public/server.ts`, `app/features/program/public/view.tsx`, `app/features/program/public/print.tsx` (the A4 landscape layout, one page run per schedule), `app/components/shared/data-table-shell.tsx` (the `reorder` seam and `DataTableDragHandle`, on `@dnd-kit`)
- Current state: implemented.
- Tests: `app/lib/presentations/presentation-table.db.test.ts`, `app/lib/presentations/ordering.test.ts`, `app/lib/presentations/warnings.test.ts`, `app/lib/presentations/participation.server.db.test.ts`, `app/lib/presentations/judge-assignments.server.db.test.ts`, `app/features/admin/presentations/list/shared.test.ts`, `app/features/admin/presentations/list/view.test.tsx`, `app/features/admin/presentations/list/view.interaction.test.tsx`, `app/features/admin/presentations/list/notices.interaction.test.tsx`, `app/features/admin/presentations/list/judge-dialogs.interaction.test.tsx`, `app/features/admin/presentations/list/server.access.db.test.ts`, `app/lib/presentations/academy-program.server.db.test.ts`, `app/features/portal/presentations/list/view.test.tsx`, `app/features/program/list.interaction.test.tsx`, `app/lib/presentations/event-program.server.db.test.ts`, `app/features/program/public/server.db.test.ts`, `app/features/program/public/view.test.tsx`

## Judging And Results

Use for judge panel access, presentations, scores, criteria, `Devolución`,
disqualifications, program, results publishing, the academy's results and
certificates.

- Domain: `docs/domain/judging.md`, `docs/domain/events.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/juzgamiento.tsx`, `app/routes/administracion.presentaciones.tsx`, `app/routes/administracion.presentaciones_.$presentationId.puntajes.tsx`, `app/routes/portal.presentaciones_.$choreographyId.tsx`, `app/routes/administracion_.resultados.exportar.tsx` (the results spreadsheet, outside the administration layout), `app/routes/portal_.presentaciones_.$choreographyId_.certificados.tsx` and `app/routes/particular_.coreografias_.$choreographyId_.certificado.tsx` (the certificate PDFs, outside their layouts)
- Judging rules (pure, shared by form and server): `app/lib/judging/judging-day.ts` (the judging day and the 03:00 close), `app/lib/judging/score-value.ts`, `app/lib/judging/sheet-total.ts`, `app/lib/judging/criteria.ts`, `app/lib/judging/award.ts`, `app/lib/judging/judge-status.ts`
- Results publication: `app/lib/judging/results.server.ts` (publish, hide, read the publication and ask whether one presentation's result is published — the single read every academy surface goes through), copy in `app/lib/judging/results-copy.ts`
- Judging persistence: `app/lib/judging/judge-list.server.ts`, `app/lib/judging/save-score.server.ts`, `app/lib/judging/score-settlement.server.ts` (administration's edit and settle), `app/lib/judging/presentation-scores.server.ts`, `app/lib/judging/criteria.server.ts`, `app/lib/judging/evaluation-status.server.ts`, `app/lib/judging/judge-write.server.ts`, `app/lib/judging/presentation-results.server.ts` (many presentations' live average, award and disqualification at once), `app/lib/judging/submodality-criteria.server.ts` (the one reader of a submodality's sheet), `app/lib/judging/sheet-values.server.ts` (the one read and the one write of a stored sheet)
- Judge surface: `app/features/judging/list/`, `app/features/judging/score/` (dialog, sheet, recorder and playback)
- Admin surface: `app/features/admin/results/list/` (the `Resultados` list: live award and average per presentation, and `publication.tsx`, the publication's confirmations and alert), `app/features/admin/results/export/` (the results spreadsheet, on the program export's columns and `app/features/admin/day-export/`, the day picker and workbook every spreadsheet export shares), `app/features/admin/presentations/scores/`, `app/features/admin/modalities/criteria-dialog.tsx`, `app/components/shared/award-badge.tsx` (the award, or `Descalificada`, as every surface shows it)
- Academy surface: `app/features/portal/presentations/list/` (the `Nivel` column and the link to a published result), `app/features/portal/presentations/detail/` (the evaluation detail: award, average and a card per judge)
- Certificates: `app/lib/certificates/` — `certificates.server.ts` (who a choreography's certificates go to: the one rule both surfaces read), `templates.server.ts` (each edition's design and sentence, matched by the event's start year, with the designer's SVG beside it minus its `texto` path), `artwork.ts` (reads that SVG to draw it as vectors), `body-layout.ts` (wraps and shrinks the sentence into the design's frame), `pdf.server.ts` (pdfkit, Montserrat from `@fontsource/montserrat`) and `response.server.ts`; the academy's `app/features/portal/presentations/certificates/` (the `Acciones` dialog and its PDF) and the individual's `app/features/individual/choreographies/certificate/`
- Evaluation locks read one fact —disqualified, or any score row— through `app/lib/presentations/evaluation-lock.server.ts`.
- `Devolución` storage: `app/lib/storage/feedback-audio.server.ts`, policy in `app/lib/storage/asset-kinds.ts`.
- Current state: scoring is built (criteria, judge panel, `Devolución`, disqualification, administrative scores), and so are results publishing and the academy's evaluation detail. There is no ranking and no public results page. Results download as a spreadsheet, for the whole event or one day, and certificates as PDFs, for the academy and the linked individual.
- Tests: `app/lib/judging/save-score.server.db.test.ts`, `app/lib/judging/score-settlement.server.db.test.ts`, `app/lib/judging/judge-list.server.db.test.ts`, `app/features/judging/score/dialog.interaction.test.tsx`, `app/features/admin/presentations/scores/server.db.test.ts`, `app/lib/judging/results.server.db.test.ts`, `app/features/portal/presentations/detail/server.db.test.ts`, `app/lib/auth/internal-navigation.server.db.test.ts`, `app/lib/auth/private-header.render.test.tsx`, `app/features/admin/results/export/server.db.test.ts`, `app/features/admin/results/export/sheet.test.ts`, `app/features/admin/results/list/server.db.test.ts`, `app/features/admin/results/list/view.test.tsx`, `app/lib/certificates/body-layout.test.ts`, `app/lib/certificates/artwork.test.ts`, `app/lib/certificates/templates.server.test.ts`, `app/lib/certificates/certificates.server.db.test.ts`, `app/features/portal/presentations/certificates/server.db.test.ts`, `app/features/individual/choreographies/server.db.test.ts`

## Cross-Cutting Validation

What to run, and when, is [validation.md](validation.md): `pnpm typecheck` for
routes and types, `pnpm test:db <path>` for persistence work. `pnpm check:repo-styles`
gates UI style and `pnpm check:file-tokens` staged file size, both in pre-commit.
