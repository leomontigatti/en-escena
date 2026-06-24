# Local Operation and Auth

This document explains how to run the current En Escena access stack locally. It
supports PRD #1, "Registro publico y autenticacion de usuarios", the Supabase
adoption ADRs [0005](adr/0005-use-supabase-postgres-before-supabase-auth.md)
and [0006](adr/0006-use-supabase-auth-for-access.md), and keeps ADR
[0001: Better Auth for access](adr/0001-better-auth-for-access.md) only as a
superseded historical record.

## Environment

Copy `.env.example` to `.env` and keep these values for the default local
setup:

```sh
DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena"
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena-test"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<local-or-shared-supabase-publishable-key>"
SUPABASE_SERVICE_ROLE_KEY="<supabase-service-role-key>"
APP_URL="http://localhost:5173"
SEND_EMAIL_HOOK_SECRET="v1,whsec_your-supabase-send-email-hook-secret"
EMAIL_FROM="En Escena <acceso@example.com>"
EMAIL_PROVIDER="brevo"
BREVO_API_KEY=""
RESEND_API_KEY=""
```

- `DATABASE_URL` points Drizzle and the app-owned domain/access tables at the
  application database. For local development, use the local Postgres
  container. In production or preview, this can point at Supabase Postgres.
- `TEST_DATABASE_URL` points database tests at their separate local database.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` configure the server-side
  Supabase Auth SSR client for per-request cookie handling inside the access
  boundary. Drizzle server-side queries do not use them.
- `SUPABASE_SERVICE_ROLE_KEY` is required for admin-side Auth operations that
  create or delete access users and other server-side Supabase Auth operations.
  Keep it server-only.
- `APP_URL` is the canonical app origin used by auth emails when Supabase does
  not include an explicit redirect URL in the hook payload.
- `SEND_EMAIL_HOOK_SECRET` verifies the Supabase Send Email Auth Hook request
  signature.
- `EMAIL_PROVIDER`, `BREVO_API_KEY`, `RESEND_API_KEY` and `EMAIL_FROM` are only
  required when `NODE_ENV=production`. Leave provider keys empty for local
  development.

Do not commit real secrets.

## Database

Local Postgres runs through `docker-compose.yml`:

- image: `postgres:17-alpine`
- container: `en-escena-postgres`
- host mapping: `localhost:5433` to container port `5432`
- database: `en-escena`
- user/password: `postgres` / `postgres`

Start it with:

```sh
docker compose up -d postgres
```

After changing schema or starting from an empty database, push the Drizzle schema
to `DATABASE_URL`:

```sh
npm run db:push
```

Confirm `.env` points at the local container before running `npm run db:push`.

### Supabase Postgres

For hosted environments, configure `DATABASE_URL` with the Supabase Postgres
connection string from the Supabase dashboard. Keep `TEST_DATABASE_URL` pointed
at local Postgres so the default DB suite and `npm run test:db:postgres` stay
isolated from hosted data. The focused command
`npm run test:db:file -- <archivo>` uses an in-process PGlite harness with a
cached schema snapshot instead of connecting to `TEST_DATABASE_URL`.

Choose the connection mode for the runtime:

- Use the direct connection or session pooler for persistent Node runtimes.
- Use the transaction pooler for serverless or short-lived runtimes.

If you use a transaction pooler, validate the app before rollout because
transaction pooling can affect prepared statements and session-level database
behavior.

For schema changes against Supabase, run `npm run db:push` only after verifying
that `DATABASE_URL` points at the intended hosted database. Database-backed tests
keep two paths:

- `npm run test:db:file -- <archivo>`: fast focused `PGlite` path backed by the
  cached schema snapshot.
- `npm run test:db` and `npm run test:db:final` (alias of
  `npm run test:db:postgres`): final reliable path that resets and pushes
  schema through `TEST_DATABASE_URL`.
- `npm run test:db:file:final -- <archivo>` (alias of
  `npm run test:db:file:postgres -- <archivo>`): focused final reliable path
  for one DB test file through `TEST_DATABASE_URL`.
- `npm run test:db:fast:full`: experimental full-suite PGlite path for harness
  debugging.

Validation mode requirements:

- Fast focused DB validation (`npm run test:db:file -- <archivo>`) does not
  require local Postgres once the repo dependencies are installed.
- Final DB validation (`npm run test:db`, `npm run test:db:final` or
  `npm run test:db:postgres`) requires local Postgres through
  `TEST_DATABASE_URL`.
- Focused final DB validation (`npm run test:db:file:final -- <archivo>` or
  `npm run test:db:file:postgres -- <archivo>`) also requires local Postgres
  through `TEST_DATABASE_URL`.

When local development needs production-like data, create and restore a fresh
production dump with [docs/db/production-dump.md](db/production-dump.md).

## Running Locally

From a fresh checkout, install dependencies, start Postgres, push the schema and
start the app:

```sh
npm install
docker compose up -d postgres
npm run db:push
npm run dev
```

The main local auth routes are:

- `/registro`: start a public academy registration with email and password.
- `/registro/confirmar?token_hash=...&type=signup`: verify the Supabase email
  confirmation link and start the academy onboarding session.
- `/registro/academia`: complete academy onboarding after the email was
  confirmed.
- `/ingresar`: sign in with email and password.
- `/recuperar-acceso`: request an access recovery email.
- `/cambiar-contrasena?code=...`: complete the Supabase Auth academy recovery
  flow after following the emailed link.
- `/invitacion/:token`: complete an internal user invitation.

## Local Email

In non-production environments, `app/lib/email.server.ts` logs messages to the
server console with an `[email:dev]` prefix and does not require provider
credentials.

Invitation links are built from the incoming request URL. Public academy
registration confirmation and recovery emails are sent by Supabase Auth, so
local verification of those flows depends on the target Supabase project and
its configured redirect URLs. With the default dev server, test registration
locally with this flow:

1. Run `npm run dev`.
2. Open `http://localhost:5173/registro`.
3. Submit an email address plus password.
4. Open the Supabase confirmation email for that project.
5. Follow the `/registro/confirmar?...` link and complete the academy form.

The same console logging pattern still applies to internal invitation emails.

If the submitted registration email already belongs to a user, the browser still
shows the generic response and does not reveal whether the account already
exists.

## Production Email

Production access emails use the app email boundary in
`app/lib/shared/email.server.ts`. Until the En Escena sending domain is ready,
use Brevo for app-owned internal invitation emails:

```sh
EMAIL_PROVIDER="brevo"
BREVO_API_KEY="xkeysib-..."
EMAIL_FROM="En Escena <verified-sender@example.com>"
```

`EMAIL_FROM` must match a sender verified in Brevo. Provider errors are logged
with an `[email:provider:error]` prefix without printing provider secrets.

When the sending domain is ready, switch the app-owned emails back to Resend:

```sh
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_..."
EMAIL_FROM="En Escena <acceso@your-verified-domain.example>"
```

`EMAIL_FROM` must use an address on the verified Resend sending domain.
Internal invitation emails use this sender.

Supabase Auth registration and recovery emails should use the app-owned Send
Email Auth Hook instead of Supabase Custom SMTP. Configure Supabase Auth Hooks:

- Hook: `Send Email`
- Method: HTTPS
- URL: `<deployed-app-origin>/auth/hooks/send-email`
- Secret: copy the generated hook secret into `SEND_EMAIL_HOOK_SECRET`
- Keep `EMAIL_PROVIDER`, `EMAIL_FROM`, and the selected provider API key
  configured in the app environment.

The hook verifies the Standard Webhooks signature from Supabase and sends
registration/recovery email through the app email boundary. It currently handles:

- `signup`: sends `/registro/confirmar?token_hash=...&type=signup`
- `recovery`: sends `/cambiar-contrasena?token_hash=...&type=recovery`

Configure these Supabase Auth dashboard values for academy registration and
recovery:

- Redirect URLs must include each deployed `/cambiar-contrasena` URL that can
  receive password recovery links, plus `http://localhost:5173/cambiar-contrasena`
  for local development.
- Redirect URLs must include each deployed `/registro/confirmar` URL that can
  receive public academy signup confirmation links, plus
  `http://localhost:5173/registro/confirmar` for local development.

## Access Auth Scope

For v1, Supabase Auth owns academy and internal credentials, public academy
email confirmation, password recovery and sessions. The app owns domain-specific
access flows and the local test harness:

- Public academy onboarding creates an `Academia` for an already confirmed
  academy identity.
- Internal invitation tokens create or activate one internal user role:
  administration, audit or judging.
- Internal password recovery remains an administrative reset with a temporary
  password; internal users do not receive recovery emails.
- Roles, academy ownership, internal usernames, suspension and mandatory
  password-change state are app-domain data. Do not put authorization
  decisions in user-editable auth metadata.

The following are not required for local operation or implementation:

- ngrok, unless a future integration explicitly requires a public callback URL.

## Agent References

When changing auth, registration, recovery or invitation behavior, keep this
reference order:

1. `CONTEXT.md`, the domain glossary and repo workflows are authoritative.
2. ADR [0006: Supabase Auth for access credentials](adr/0006-use-supabase-auth-for-access.md)
   is the accepted target architecture. ADR
   [0001: Better Auth for access](adr/0001-better-auth-for-access.md) is
   historical and superseded.
3. `docs/agents/coding-standards.md` controls test and implementation style.
4. Vendored React/Vercel skills are supporting references when UI or route work
   is relevant: `react-best-practices`, `web-design-guidelines`,
   `composition-patterns` and `react-view-transitions`.

## Validation Guardrail

Use this repo's validation scripts. For TypeScript validation, run:

```sh
npm run typecheck
```

Do not run `npx tsc` directly. `npm run typecheck` runs React Router type
generation before TypeScript checks the app.
