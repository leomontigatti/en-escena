# Access

Rules for public academy registration, users, sessions and internal invitations.

- Public academy registration starts with email plus password and asks the access auth provider (Better Auth, ADR-0013) to send the confirmation link.
- The access auth provider owns public registration email confirmation and the confirmed academy identity session created from that email link. The confirmation URL keeps the legacy `token_hash` plus `type=signup` shape so links already emailed keep working; the current provider accepts it and it must not be "corrected".
- The academy onboarding form uses the confirmed session identity, keeps the confirmed email fixed, and collects academy data.
- If email already belongs to an existing user, public response must not reveal it.
- `Identidad confirmada pendiente de academia` means the access auth provider already confirmed the academy access identity, but academy onboarding has not created the `Academia` yet.
- If that confirmed identity returns from login or direct navigation, the app must let it resume academy onboarding instead of forcing a new registration.
- There is no automatic cleanup under this first maintenance policy; the incomplete state stays resumable and maintenance must list confirmed academy `Usuario` records with no `Academia` for a later operational decision.
- Completing academy onboarding creates the academy, keeps the confirmed academy user, authenticates the academy, and does not require admin approval.
- A `Usuario` has one main permission: academia, administración, auditoría or juzgamiento.
- Academy users sign in with a verified email and password.
- Internal users sign in with a `Nombre de usuario interno` and password.
- `Nombre de usuario interno` is unique ignoring case, normalized to lowercase, 3 to 32 characters, and only accepts lowercase letters, numbers, dot, hyphen and underscore. It cannot contain spaces, accents or email-like values.
- A `Usuario` auditor is read-only and cannot create, edit, publish, unpublish, cancel, correct or annul.
- Session inactivity limit is 8 hours for all permissions; logout affects only current session.
- Admins create internal users directly with a temporary password; the first internal login requires a `Cambio obligatorio de contraseña`.
- Academy users recover access by email through the access auth provider and define the new password on `Cambio de contraseña`.
- Internal password recovery is an administrative reset that assigns a temporary password and requires a `Cambio obligatorio de contraseña`.
- Admins can create, edit, suspend, reactivate, reset passwords and change permissions for internal users; auditors can view users read-only.
- Creating internal users, changing permissions, suspending or reactivating users, administrative password resets and completing mandatory password changes leave no administrative audit trail: there is no record of who changed what. Raw passwords and password hashes are never persisted outside the credential store.
- Internal users use the app-owned credential store and the same 8-hour session policy as academy users.
- Better Auth owns production academy credentials, public registration email confirmation, academy password recovery and academy sessions; app code owns academy onboarding, invitations and the local test harness. Pre-cutover `sb-*` cookies are only expired by a migration shim (`app/lib/auth/legacy-session-cookies.server.ts`), not read by any provider.

## Permission Matrix

This matrix describes domain authority, not component visibility. Server guards
and actions must enforce it even when UI controls are hidden.

| Permission  | Main scope                                            | Can mutate                                                                                                                       | Cannot mutate                                                                                              |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| academia    | Their own data in the `Portal de academias`           | Their own academy profile, professors, dancers and choreographies, within the rules of the `Evento activo`                       | `Panel de administración`, internal users, publications, administrative corrections, other academies' data |
| admin       | Operating the `Panel de administración`               | Events, `Bases del evento`, internal users, administrative corrections, publications and the allowed actions on operational data | Technical credentials outside the defined flows                                                            |
| auditor     | Read-only over administration and audit               | Nothing in business flows                                                                                                        | Create, edit, publish, unpublish, cancel, correct, annul, suspend or reactivate                            |
| juzgamiento | The evaluation assigned in the `Panel de juzgamiento` | Scores, judge feedback (`Devolución`) and disqualifications within the assigned evaluation flow                                  | General administration, `Bases del evento`, users, financial data and other areas' data                    |
