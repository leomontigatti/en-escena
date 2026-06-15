# Use direct username access for internal users

Internal users will be created directly from the Panel de administración with a Nombre de usuario interno and a temporary password, instead of relying on email invitations. Better Auth remains the owner of password hashing and session primitives, but internal access no longer requires a valid or verified email; the first internal login is limited to a mandatory password change, and the new password must be stored with the same hashing mechanism used by Better Auth.

**Considered Options**

- Keep internal invitations by email: safer default and already aligned with Better Auth email/password flows, but it blocks users without valid email access and makes local event operations depend on email delivery.
- Create internal users directly with username and temporary password: fits the operational need, but requires app-owned username login and first-login password-change rules.

**Consequences**

- ADR-0001 still applies to academy registration, password recovery, hashing and sessions, but no longer describes internal user onboarding.
- Internal password resets are administrative: an admin assigns a new temporary password and the user must change it before entering their private area.
- Academy users continue using email-based access and recovery.
