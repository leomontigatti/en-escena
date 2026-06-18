# Use Supabase Auth for access credentials

We will replace Better Auth with Supabase Auth as the provider for access credentials, sessions, password reset tokens, and auth cookies, while keeping `Usuario` as the app-domain access profile. `Usuario` keeps roles, academy ownership, internal usernames, suspension, and mandatory password-change state; Supabase Auth owns only technical authentication state.

**Status**: accepted

**Supersedes**: ADR-0001

**Considered Options**

- Keep Better Auth: smallest short-term change, but keeps the app on a separate auth provider after adopting Supabase infrastructure.
- Move all access data into Supabase Auth user metadata: fewer app tables, but unsafe for authorization if based on user-editable metadata and weaker fit for En Escena domain terms.
- Use Supabase Auth for credentials and sessions, with `Usuario` as the domain profile: aligns with Supabase adoption while preserving app-owned access rules.

**Decision Details**

- `en_escena_user.id` will match `auth.users.id` for newly created users.
- Existing Better Auth users do not need migration; users can be recreated in Supabase Auth.
- Public academy registration remains an app-owned domain flow: a registration token creates a Supabase Auth user, a `Usuario`, and an `Academia`, then starts a session.
- Internal users keep `Nombre de usuario interno` as their login identifier; the server maps it to the technical email used by Supabase Auth before password sign-in.
- Internal users keep `Cambio obligatorio de contraseña`; Supabase Auth changes the password, and `Usuario.requiresPasswordChange` tracks the domain rule.
- Academy registration should not send an additional Supabase confirmation email; the app registration token is enough to prove email access before creating the Supabase Auth user.
- Access recovery by email is for academy users. Internal users recover access through administrative password reset, even when they have an optional real email.
- Suspended users are blocked in server guards and should have Supabase Auth sessions revoked when suspended.
- Supabase Auth must use custom SMTP through Resend from the start. The app keeps Resend for domain emails such as public academy registration.
- Drizzle remains the app server's data access layer for domain tables. This migration does not expose domain data through Supabase Data API or move authorization into RLS.
- The implementation should introduce an app-owned access provider boundary before replacing Better Auth calls, so route code and database tests do not depend directly on Supabase SDK details.

**Consequences**

- ADR-0001 is superseded; Better Auth tables and dependencies can be removed after the provider migration is complete.
- Supabase server-side React Router clients must apply `@supabase/ssr` cookie writes and cache headers on responses, including token refresh responses.
- Server authorization must not trust `getSession()` user data alone; use verified Supabase identity methods and then load `Usuario` from the app database.
