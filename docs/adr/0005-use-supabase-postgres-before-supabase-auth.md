# Use Supabase Postgres before migrating access auth

We will introduce Supabase in two phases. First, use Supabase Postgres as the
production database while keeping the existing Drizzle data access layer and
Better Auth access stack. Later, evaluate and implement a separate migration
from Better Auth to Supabase Auth.

**Context**

En Escena already uses Postgres through Drizzle. Supabase Postgres is compatible
with that model, so the runtime database can move from a local or self-managed
Postgres URL to a Supabase Postgres URL without changing route loaders,
repositories, or domain queries.

The access stack is different. Better Auth currently owns credentials, password
hashing, sessions, password recovery primitives, and HTTP auth handlers. App
code also depends on Better Auth session semantics in shared authorization
helpers, public academy registration, internal user invitations, mandatory
password changes, suspension behavior, and database-backed tests.

Changing the database host and changing the auth provider have different risk
profiles. Combining both would make failures harder to isolate.

**Decision**

Phase 1 uses Supabase only as a hosted Postgres provider:

- `DATABASE_URL` may point at a Supabase Postgres connection string in
  production, preview, or any environment that should use hosted data.
- `TEST_DATABASE_URL` remains a separate local Postgres database for
  database-backed tests.
- `npm run test:db` must continue to target `TEST_DATABASE_URL`; it must not use
  the production Supabase database.
- Drizzle remains the app's server-side data access layer for domain tables.
- Better Auth remains the access provider until a dedicated Supabase Auth
  migration replaces it.

Phase 2, when started, will define a new auth model before code changes. That
model must decide how Supabase Auth users relate to the app-domain user profile,
roles, academies, internal usernames, suspension, invitations, access recovery,
and mandatory password changes.

**Connection Guidance**

Use the Supabase dashboard connection string that matches the deployment
environment:

- Direct connection or session pooler for persistent Node runtimes.
- Transaction pooler for serverless or short-lived runtimes.

When using a transaction pooler, verify client compatibility before switching
runtime traffic because transaction pooling can affect prepared statements and
session-level database behavior.

**Considered Options**

- Migrate database hosting first, keep Better Auth: smallest change because the
  app already speaks Postgres through Drizzle.
- Migrate Supabase Auth first, keep local Postgres: higher risk because auth is
  spread across route actions, shared guards, tests, and domain flows.
- Migrate Supabase Postgres and Supabase Auth together: fastest path to the
  target stack, but it combines infrastructure, schema, sessions, cookies,
  redirects, and tests in one large failure surface.

**Consequences**

- The local development default can stay on Docker Postgres.
- Production configuration can move to Supabase by changing environment
  variables rather than rewriting repositories.
- Database tests stay deterministic and isolated from hosted data.
- Better Auth tables stay in the Drizzle schema during Phase 1.
- A future Supabase Auth migration must supersede ADR 0001 rather than silently
  editing around it.
