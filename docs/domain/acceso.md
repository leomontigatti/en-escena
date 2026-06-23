# Acceso

Rules for public academy registration, users, sessions and internal invitations.

- Public academy registration starts with an email-only page and sends a one-use link valid for one day.
- Supabase Auth owns public registration email confirmation and the confirmed academy identity session created from that email link.
- The academy onboarding form uses the confirmed session identity, keeps the confirmed email fixed, and collects academy data.
- If email already belongs to an existing user, public response must not reveal it.
- `Identidad confirmada pendiente de academia` means Supabase Auth already confirmed the academy access identity, but academy onboarding has not created the `Academia` yet.
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
