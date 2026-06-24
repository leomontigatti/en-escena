# Acceso

Rules for public academy registration, users, sessions and internal invitations.

- Public academy registration starts with email plus password and asks Supabase Auth to send the confirmation link.
- Supabase Auth owns public registration email confirmation and the confirmed academy identity session created from that email link.
- The academy onboarding form uses the confirmed session identity, keeps the confirmed email fixed, and collects academy data.
- If email already belongs to an existing user, public response must not reveal it.
- `Identidad confirmada pendiente de academia` means Supabase Auth already confirmed the academy access identity, but academy onboarding has not created the `Academia` yet.
- If that confirmed identity returns from login or direct navigation, the app must let it resume academy onboarding instead of forcing a new registration.
- No hay limpieza automática para esta primera política de mantenimiento; el estado incompleto queda reanudable y el mantenimiento debe listar `Usuario` academia confirmados sin `Academia` para decisión operativa posterior.
- Completing academy onboarding creates the academy, keeps the confirmed academy user, authenticates the academy, and does not require admin approval.
- A `Usuario` has one main permission: academia, administración, auditoría or juzgamiento.
- Academy users sign in with a verified email and password.
- Internal users sign in with a `Nombre de usuario interno` and password.
- `Nombre de usuario interno` is unique ignoring case, normalized to lowercase, 3 to 32 characters, and only accepts lowercase letters, numbers, dot, hyphen and underscore. It cannot contain spaces, accents or email-like values.
- A `Usuario` auditor is read-only and cannot create, edit, publish, unpublish, cancel, correct or annul.
- Session inactivity limit is 8 hours for all permissions; logout affects only current session.
- Admins create internal users directly with a temporary password; the first internal login requires a `Cambio obligatorio de contraseña`.
- Academy users recover access by email through Supabase Auth and define the new password on `Cambio de contraseña`.
- Internal password recovery is an administrative reset that assigns a temporary password and requires a `Cambio obligatorio de contraseña`.
- Admins can create, edit, suspend, reactivate, reset passwords and change permissions for internal users; auditors can view users read-only.
- Creating internal users, changing permissions, suspending or reactivating users, administrative password resets and completing mandatory password changes must keep administrative traceability without storing raw passwords or password hashes in audit payloads.
- Internal users use the app-owned credential store and the same 8-hour session policy as academy users.
- Supabase Auth owns production academy credentials, public registration email confirmation, academy password recovery and academy sessions; app code owns academy onboarding, invitations and the local test harness.

## Permission Matrix

This matrix describes domain authority, not component visibility. Server guards
and actions must enforce it even when UI controls are hidden.

| Permiso     | Alcance principal                              | Puede mutar                                                                                                                            | No puede mutar                                                                                                    |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| academia    | Datos propios del Portal de academias          | Perfil de academia, profesores, bailarines y coreografías propias dentro de las reglas del Evento activo                               | Panel de administración, usuarios internos, publicaciones, correcciones administrativas, datos de otras academias |
| admin       | Operación del Panel de administración          | Eventos, Bases del evento, usuarios internos, correcciones administrativas, publicaciones y acciones permitidas sobre datos operativos | Credenciales técnicas fuera de los flujos definidos, acciones sin trazabilidad cuando el dominio exige razón      |
| auditor     | Lectura de administración y auditoría          | Nada en flujos de negocio                                                                                                              | Crear, editar, publicar, despublicar, cancelar, corregir, anular, suspender o reactivar                           |
| juzgamiento | Evaluación asignada en el Panel de juzgamiento | Puntajes, devoluciones y descalificaciones dentro del flujo de evaluación asignado                                                     | Administración general, Bases del evento, usuarios, datos financieros y datos de otras áreas                      |
