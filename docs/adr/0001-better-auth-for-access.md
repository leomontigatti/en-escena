# Superseded: Use Better Auth for access credentials

Superseded on 2026-06-17 by the completed Supabase Auth migration and app-owned
local test harness. Keep this ADR only as historical context.

**Status**: superseded by ADR-0006

We will use Better Auth for credential-based authentication, sessions, and password recovery, while keeping domain-specific access flows such as public academy registration and internal user invitations in application code. This avoids building password/session security ourselves, but keeps the academy registration boundary explicit: a registration token creates an academy plus its single academy user, while Better Auth owns the resulting verified email, password, and session.

**Considered Options**

- Build authentication directly in the app, including password hashing, sessions, verification, and recovery.
- Use Better Auth for all access concerns and adapt its generic flows to academy registration.
- Use Better Auth for credentials and sessions, plus app-owned token flows for domain-specific registration and invitations.

**Consequences**

- Auth tables, handlers, and session semantics become coupled to Better Auth.
- Registration and invitation tokens stay separate from login sessions because they create or activate domain access rather than authenticate an existing user.
- User roles and academy ownership remain part of the app domain, not Better Auth organizations.
