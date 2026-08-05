# Use Better Auth for access credentials

**Status**: superseded by ADR-0013

Superseded as a decision record, not as architecture. This ADR was marked
superseded on 2026-06-17 by the Supabase Auth migration (ADR-0006) — a migration
that was later reverted, which left this file labelling the stack actually
running as dead. Better Auth is the live access provider again (#266, #420);
[ADR-0013](./0013-exit-supabase.md) records why, and the shape it came back in
differs from what is described below.

We will use Better Auth for credential-based authentication, sessions, and password recovery, while keeping domain-specific access flows such as public academy registration and internal user invitations in application code. This avoids building password/session security ourselves, but keeps the academy registration boundary explicit: a registration token creates an academy plus its single academy user, while Better Auth owns the resulting verified email, password, and session.

**Considered Options**

- Build authentication directly in the app, including password hashing, sessions, verification, and recovery.
- Use Better Auth for all access concerns and adapt its generic flows to academy registration.
- Use Better Auth for credentials and sessions, plus app-owned token flows for domain-specific registration and invitations.

**Consequences**

- Auth tables, handlers, and session semantics become coupled to Better Auth.
- Registration and invitation tokens stay separate from login sessions because they create or activate domain access rather than authenticate an existing user.
- User roles and academy ownership remain part of the app domain, not Better Auth organizations.
