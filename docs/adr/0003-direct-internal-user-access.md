# Use direct username access for internal users

Internal users will be created directly from the Panel de administración with a Nombre de usuario interno and a temporary password, instead of relying on email invitations. Internal access no longer requires a valid or verified email; the first internal login is limited to a mandatory password change, and internal credentials remain app-owned.

**Considered Options**

- Keep internal invitations by email: safer default, but it blocks users without valid email access and makes local event operations depend on email delivery.
- Create internal users directly with username and temporary password: fits the operational need, but requires app-owned username login and first-login password-change rules.

**Consequences**

- ADR-0001 is now historical; this ADR still describes internal user onboarding and password-change requirements.
- Internal password resets are administrative: an admin assigns a new temporary password and the user must change it before entering their private area.
- Academy users continue using email-based access and recovery.

## Amendment (2026-09-30): the temporary password and the mandatory first-login change are retired

The administrator now types the internal user's definitive password, on creation and on an administrative reset, and the user signs in with it straight away. The mandatory `Cambio obligatorio de contraseña` step, its `/cambiar-contrasena` mode and the `Cambio obligatorio` user state are gone; `/cambiar-contrasena` serves academy recovery only. The panel is operated by one small team that hands credentials over in person, so the forced change added a step to every judge onboarding without changing who knew the password. An administrative reset still closes the user's open sessions. The `requires_password_change` column is dropped in a follow-up contract migration once no running container selects it.
