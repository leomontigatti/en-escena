# Codebase Map

Operational map for agents moving from a product flow to the files that usually
matter. Use this after `CONTEXT.md`, the relevant ADRs and `docs/domain/`.

This file is intentionally compact. It is not a full dependency graph and should
only list stable entry points, coordination modules and high-signal tests.

## Public Academy Registration

Use for public academy signup, Supabase email confirmation and pending academy
onboarding.

- Domain: `docs/domain/acceso.md`
- ADRs: `docs/adr/0005-use-supabase-postgres-before-supabase-auth.md`, `docs/adr/0006-use-supabase-auth-for-access.md`
- Local operation: `docs/local-auth.md`
- Routes: `app/routes/registro.tsx`, `app/routes/registro.confirmar.tsx`, `app/routes/registro.academia.tsx`, `app/routes/registro.error-confirmacion.tsx`
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

## Event Context And Bases Del Evento

Use for active event behavior, event CRUD, modalities, categories, schedules,
schedule capacities, prices and registration readiness.

- Domain: `docs/domain/eventos.md`, `docs/domain/coreografias.md`, `docs/domain/finanzas.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.eventos.tsx`, `app/routes/administracion.eventos_.nuevo.tsx`, `app/routes/administracion.eventos_.$eventId.tsx`, `app/routes/administracion.modalidades.tsx`, `app/routes/administracion.categorias.tsx`, `app/routes/administracion.cronogramas.tsx`, `app/routes/administracion.precios.tsx`
- Server modules: `app/lib/admin/event-context.server.ts`, `app/lib/admin/events/bases-route.server.ts`, `app/lib/admin/events/bases-action.server.ts`, `app/lib/events/management.server.ts`, `app/lib/events/bases.server.ts`, `app/lib/events/bases-repository.server.ts`, `app/lib/events/registration-readiness.server.ts`
- Tests: `app/lib/admin/event-context.server.test.ts`, `app/lib/events/management.server.db.test.ts`, `app/lib/events/bases.server.test.ts`, `app/lib/events/bases-repository.server.db.test.ts`, `app/lib/admin/events/events-route.server.db.test.ts`, `app/lib/admin/events/event-detail-route.server.db.test.ts`, `app/lib/admin/events/bases-route.server.db.test.ts`, `app/lib/events/registration-readiness.server.db.test.ts`

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
- UI modules: `app/features/portal/choreographies/list/view.tsx`, `app/features/portal/choreographies/create/dialog.tsx`, `app/features/portal/choreographies/detail/view.tsx`, `app/features/portal/choreographies/detail/roster-editor.tsx`, `app/features/portal/choreographies/detail/roster-editor-form.tsx`, `app/features/portal/choreographies/detail/delete-dialog.tsx`
- Tests: `app/features/portal/choreographies/detail/server.db.test.ts`, `app/lib/choreographies/registration-resolution.server.db.test.ts`, `app/lib/choreographies/registration-confirmation.server.db.test.ts`, `app/features/portal/choreographies/list/server.db.test.ts`, `app/features/portal/choreographies/create/flow.test.ts`, `app/features/portal/choreographies/request-flow.render.test.tsx`, `app/features/portal/choreographies/detail/server.test.ts`

## Admin Roster

Use for administration and audit views over professors, dancers, participation
filters, archive/reactivate flows and admin corrections.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/acceso.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.profesores.tsx`, `app/routes/administracion.profesores_.$professorId.tsx`, `app/routes/administracion.bailarines.tsx`, `app/routes/administracion.bailarines_.$dancerId.tsx`
- Server modules: `app/lib/admin/professors/professors.server.ts`, `app/lib/admin/professors/professor-detail.shared.ts`, `app/lib/admin/dancers/dancers.server.ts`, `app/lib/admin/dancers/dancers-update.server.ts`, `app/lib/admin/dancers/dancers-audit.server.ts`, `app/lib/admin/dancers/dancer-detail.shared.ts`, `app/lib/participation/participation.server.ts`
- Tests: `app/lib/admin/professors/professors-route.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.server.db.test.ts`, `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`, `app/lib/admin/dancers/inscriptions-section.render.test.tsx`

## Admin Migration To app/features/admin

Use for the structural migration of the Panel de administración into thin route
adapters plus feature-owned flows in the admin feature tree.

- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`, `docs/adr/0002-selectable-event-contexts.md`
- Keep route files in `app/routes` as thin adapters for `loader`, `action`, `meta`, `handle` and minimal route/view wiring.
- Put admin-owned workflow code under app/features/admin/<resource>/<flow>/, usually `list/`, `detail/`, `create/` or resource-specific action folders.
- Keep `app/components/admin` in place for this migration. Reuse it for shell/layout/shared widgets and only touch it for narrow wiring needed by one slice.
- Use `app/lib` only for domain-neutral or genuinely cross-surface behavior. Admin-only screens, tables, dialogs and route orchestration should move behind admin feature modules instead of adding shallow wrappers in `app/lib`.
- For Bases del evento, keep direct resource names such as `event-modalities`, `event-categories`, `event-schedules` and `event-prices`; reserve broader `event-bases` names for aggregators that coordinate several resources.

### Professors

- Routes: `app/routes/administracion.profesores.tsx`, `app/routes/administracion.profesores_.$professorId.tsx`
- Current server modules: `app/lib/admin/professors/professors.server.ts`, `app/lib/admin/professors/professor-detail.shared.ts`
- Current UI modules: `app/lib/admin/professors/professor-detail-view.tsx`, `app/lib/admin/professors/professor-detail-form.tsx`, `app/lib/admin/professors/professor-detail-confirmation-dialog.tsx`
- Current tests: `app/lib/admin/professors/professors-route.server.db.test.ts`
- Migration target: start with app/features/admin/professors/list/ and app/features/admin/professors/detail/, keeping repository and domain behavior in `app/lib` only when it is neutral beyond the admin surface.

### Dancers

- Routes: `app/routes/administracion.bailarines.tsx`, `app/routes/administracion.bailarines_.$dancerId.tsx`
- Current server modules: `app/lib/admin/dancers/dancers.server.ts`, `app/lib/admin/dancers/dancers-list.server.ts`, `app/lib/admin/dancers/dancers-detail.server.ts`, `app/lib/admin/dancers/dancers-update.server.ts`, `app/lib/admin/dancers/dancers-audit.server.ts`, `app/lib/admin/dancers/dancers-inscriptions.server.ts`, `app/lib/admin/dancers/dancers-identity.server.ts`, `app/lib/admin/dancers/dancers-active-state.server.ts`, `app/lib/admin/dancers/dancers-mutation-helpers.server.ts`, `app/lib/admin/dancers/dancer-detail.shared.ts`
- Current UI modules: `app/lib/admin/dancers/dancer-detail-view.tsx`, `app/lib/admin/dancers/dancer-detail-form.tsx`, `app/lib/admin/dancers/dancer-detail-confirmation-dialog.tsx`
- Current tests: `app/lib/admin/dancers/dancers-route.server.db.test.ts`, `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`, `app/lib/admin/dancers/inscriptions-section.render.test.tsx`
- Migration target: split by `list/` and `detail/` first; keep audit and mutation helpers shared only if both flows still use the same neutral boundary after extraction.

### Choreographies

- Routes: `app/routes/administracion.coreografias.tsx`
- Current feature modules: `app/features/admin/choreographies/list/server.ts`, `app/features/admin/choreographies/list/view.tsx`
- Current tests: `app/features/admin/choreographies/list/view.test.tsx`, `app/lib/admin/choreographies/choreographies-route.server.db.test.ts`, `app/lib/admin/choreographies/choreographies-route-filters.server.db.test.ts`
- Fixtures: no dedicated admin choreography fixture helper yet; scenarios live inline in the route DB tests.
- Migration target: keep using app/features/admin/choreographies/... as the reference shape for later admin slices instead of pushing list/view logic back into route files.

### Users

- Routes: `app/routes/administracion.usuarios.tsx`, `app/routes/administracion.usuarios_.nuevo.tsx`, `app/routes/administracion.usuarios_.$userId.tsx`, `app/routes/administracion.usuarios_.invitaciones.tsx`
- Current feature modules: `app/features/admin/users/list/`, `app/features/admin/users/detail/`
- Current server modules: `app/lib/admin/users/users-list.server.ts`, `app/lib/admin/users/internal-user-create.server.ts`, `app/lib/admin/users/internal-user-update.server.ts`, `app/lib/admin/users/internal-user-suspension.server.ts`, `app/lib/admin/users/internal-user-password-reset.server.ts`, `app/lib/admin/users/internal-user-credentials.server.ts`, `app/lib/admin/users/internal-user-credentials.shared.ts`, `app/lib/admin/users/user-invitation.server.ts`
- Current UI modules: `app/features/admin/users/list/view.tsx`, `app/features/admin/users/detail/view.tsx`, `app/lib/admin/users/user-detail-edit-form.tsx`, `app/lib/admin/users/user-detail-password-reset-form.tsx`, `app/lib/admin/users/user-detail-cards.tsx`, `app/lib/admin/users/user-detail-role-field.tsx`
- Current tests: `app/lib/admin/users/users-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create-route.server.db.test.ts`, `app/lib/admin/users/internal-user-create.server.db.test.ts`, `app/lib/admin/users/user-detail-route.server.db.test.ts`, `app/lib/admin/users/internal-invitation-route.server.db.test.ts`, `app/lib/admin/users/user-invitation.server.db.test.ts`
- Fixtures: no dedicated admin users fixture helper yet; route and server DB tests are still the discovery seam.
- Migration target: carve out `list/`, `create/`, `detail/` and `invitations/` flows under app/features/admin/users/ while leaving auth/session policy in `app/lib/auth` and shared credential logic in `app/lib/admin/users` only if it remains neutral.

### Events And Bases Del Evento

- Routes: `app/routes/administracion.eventos.tsx`, `app/routes/administracion.eventos_.nuevo.tsx`, `app/routes/administracion.eventos_.$eventId.tsx`, `app/routes/administracion.modalidades.tsx`, `app/routes/administracion.modalidades_.nueva.tsx`, `app/routes/administracion.modalidades_.$modalityId.tsx`, `app/routes/administracion.categorias.tsx`, `app/routes/administracion.categorias_.nueva.tsx`, `app/routes/administracion.categorias_.$categoryId.tsx`, `app/routes/administracion.cronogramas.tsx`, `app/routes/administracion.cronogramas_.nuevo.tsx`, `app/routes/administracion.cronogramas_.$scheduleId.tsx`, `app/routes/administracion.precios.tsx`, `app/routes/administracion.precios_.nuevo.tsx`, `app/routes/administracion.precios_.$priceId.tsx`
- Current server modules: `app/lib/admin/event-context.server.ts`, `app/lib/admin/events/bases-route.server.ts`, `app/lib/admin/events/bases-action.server.ts`, `app/lib/admin/events/bases-action/modalities.server.ts`, `app/lib/admin/events/bases-action/categories.server.ts`, `app/lib/admin/events/bases-action/schedules.server.ts`, `app/lib/admin/events/bases-action/prices.server.ts`, `app/lib/admin/events/bases-action/shared.server.ts`, `app/lib/admin/events/bases-action/input.server.ts`, `app/lib/admin/events/event-bases-navigation.ts`
- Current UI modules: `app/components/admin/events/form.tsx`, `app/components/admin/events/event-modalities.tsx`, `app/components/admin/events/event-categories.tsx`, `app/components/admin/events/event-schedules.tsx`, `app/components/admin/events/event-schedules/route-views.tsx`, `app/components/admin/events/event-schedules/form.tsx`, `app/components/admin/events/event-schedules/list-table.tsx`, `app/components/admin/events/event-schedules/dialogs.tsx`, `app/components/admin/events/event-prices.tsx`, `app/components/admin/events/event-prices/route-views.tsx`, `app/components/admin/events/event-prices/form.tsx`, `app/components/admin/events/event-prices/list-table.tsx`
- Current tests: `app/lib/admin/events/events-route.server.db.test.ts`, `app/lib/admin/events/event-detail-route.server.db.test.ts`, `app/lib/admin/events/bases-route.server.db.test.ts`, `app/lib/admin/events/bases-route-cronogramas.server.db.test.ts`, `app/lib/admin/events/events-route.render.test.tsx`, `app/lib/admin/events/event-form-submission.render.test.tsx`, `app/lib/admin/events/event-bases-forms.render.test.tsx`, `app/lib/admin/events/event-bases-navigation.test.ts`, `app/components/admin/events/event-prices.test.tsx`
- Large fixtures/helpers: `app/lib/admin/events/bases-route.test-helpers.tsx`
- Migration target: break this area by resource or behavior, not as one move. A practical sequence is `events/list`, `events/detail`, then separate `event-modalities`, `event-categories`, `event-schedules` and `event-prices` feature folders, keeping app/lib/events as the shared domain/persistence layer.

## Judging And Results

Use for judge panel access, presentations, scores, disqualifications, ranking,
program and results visibility.

- Domain: `docs/domain/juzgamiento.md`, `docs/domain/eventos.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/juzgamiento.tsx`, `app/routes/auditoria.tsx`
- Current state: shell routes and access guards exist; most judging domain rules are documented ahead of deeper implementation.
- Tests: `app/lib/auth/internal-navigation.server.db.test.ts`, `app/lib/auth/internal-navigation.server.test.ts`, `app/lib/auth/private-header.render.test.tsx`

## Cross-Cutting Validation

- Run route/type validation with `npm run typecheck`, never `npx tsc`.
- Use `npm run test:db:file -- <path>` for focused persistence work and `npm run test:db` for final DB confidence.
- Use `npm run check:repo-styles` after UI changes.
- Use `npm run check:file-tokens` before committing staged application source.
- Performance notes live in `docs/agents/request-performance-baseline.md` and `docs/agents/request-performance-refactor-plan.md`.
