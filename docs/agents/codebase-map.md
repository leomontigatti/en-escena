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

## Portal People

Use for academy-owned professors, dancers, dancer verification and document
image storage.

- Domain: `docs/domain/coreografias.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`, `docs/adr/0008-use-supabase-storage-for-uploaded-assets.md`
- Routes: `app/routes/portal.profesores.tsx`, `app/routes/portal.profesores_.$professorId.tsx`, `app/routes/portal.bailarines.tsx`, `app/routes/portal.bailarines_.$dancerId.tsx`
- Server modules: `app/lib/portal/professors.server.ts`, `app/lib/portal/professor-records.server.ts`, `app/lib/portal/dancers.server.ts`, `app/lib/dancers/dancer-records.server.ts`, `app/lib/dancers/verification.ts`, `app/lib/storage/dancer-documents.server.ts`
- Tests: `app/lib/portal/route.server.db.test.ts`, `app/lib/portal/route.render.test.tsx`, `app/lib/portal/bailarines-dialog.test.tsx`, `app/lib/storage/dancer-documents.server.test.ts`

## Portal Coreografias

Use for choreography lists, registration, detail edits, people links, locks,
schedule resolution and operational completion.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/finanzas.md`
- ADRs: `docs/adr/0002-selectable-event-contexts.md`, `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/portal.coreografias.tsx`, `app/routes/portal.coreografias_.crear.tsx`, `app/routes/portal.coreografias_.$choreographyId.tsx`
- Server modules: `app/lib/portal/choreographies.server.ts`, `app/lib/portal/choreography-create-flow.ts`, `app/lib/portal/choreography-create-dialog.server.ts`, `app/lib/portal/coreografia-detail.server.ts`, `app/lib/choreographies/registration-resolution.server.ts`, `app/lib/choreographies/registration-confirmation.server.ts`
- UI modules: `app/lib/portal/coreografia-detail.tsx`, `app/lib/portal/coreografia-people-editor.tsx`, `app/lib/portal/coreografia-detail/people-editor-form.tsx`, `app/lib/portal/coreografia-detail/delete-choreography-dialog.tsx`
- Tests: `app/lib/portal/choreographies.server.db.test.ts`, `app/lib/choreographies/registration-resolution.server.db.test.ts`, `app/lib/choreographies/registration-confirmation.server.db.test.ts`, `app/lib/portal/choreography-create-flow.test.ts`, `app/lib/portal/coreografias-request-flow.render.test.tsx`, `app/lib/portal/coreografia-detail.server.test.ts`

## Admin People

Use for administration and audit views over professors, dancers, participation
filters, archive/reactivate flows and admin corrections.

- Domain: `docs/domain/coreografias.md`, `docs/domain/eventos.md`, `docs/domain/acceso.md`
- ADRs: `docs/adr/0004-organize-app-code-by-product-surface.md`
- Routes: `app/routes/administracion.profesores.tsx`, `app/routes/administracion.profesores_.$professorId.tsx`, `app/routes/administracion.bailarines.tsx`, `app/routes/administracion.bailarines_.$dancerId.tsx`
- Server modules: `app/lib/admin/professors/professors.server.ts`, `app/lib/admin/professors/professor-detail.shared.ts`, `app/lib/admin/dancers/dancers.server.ts`, `app/lib/admin/dancers/dancers-update.server.ts`, `app/lib/admin/dancers/dancers-audit.server.ts`, `app/lib/admin/dancers/dancer-detail.shared.ts`, `app/lib/people/participation.server.ts`
- Tests: `app/lib/admin/professors/professors-route.server.db.test.ts`, `app/lib/admin/dancers/dancers-route.server.db.test.ts`, `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`, `app/lib/admin/dancers/inscriptions-section.render.test.tsx`

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
