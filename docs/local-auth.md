# Local Operation and Auth

This document explains how to run the current En Escena access stack locally. It
supports PRD #1, `Registro público y autenticación de usuarios`. Better Auth is
the only credential provider; ADR
[0013: Exit Supabase](adr/0013-exit-supabase.md) records why the Supabase
adoption ADRs (0001, 0005, 0006, 0008 and 0010) are superseded.

## Environment

Copy `.env.example` to `.env` and keep these values for the default local
setup:

```sh
DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena"
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena-test"
APP_URL="http://localhost:5173"
BETTER_AUTH_SECRET="<a-long-random-better-auth-secret>"
BETTER_AUTH_URL="http://localhost:5173"
EMAIL_FROM="En Escena <acceso@example.com>"
EMAIL_PROVIDER="resend"
BREVO_API_KEY=""
RESEND_API_KEY=""
```

- `DATABASE_URL` points Drizzle and the app-owned domain/access tables at the
  application database. For local development, use the local Postgres
  container. In production it points at the Coolify-managed Postgres described
  in [Production infrastructure](operations/infrastructure.md#database).
- `TEST_DATABASE_URL` points database tests at their separate local database.
- `APP_URL` is the canonical app origin, used as the fallback base URL for auth
  email links when a request URL is not available.
- `BETTER_AUTH_SECRET` signs Better Auth sessions and the recovery-token cookie.
  It also signs the flash-notification cookie (`ee-flash`) by default. Use a
  long random value per environment.
- `SESSION_SECRET` is optional and only overrides the signing secret for the
  flash-notification cookie. Leave it unset unless that secret must be kept
  separate from `BETTER_AUTH_SECRET`.
- `BETTER_AUTH_URL` is the `baseURL` Better Auth uses to build its endpoints and
  email links. It defaults to `APP_URL` when unset.
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

After changing the schema, generate a migration and apply pending migrations to
the local `DATABASE_URL`:

```sh
pnpm db:generate
pnpm db:migrate
```

Confirm `.env` points at the local container before running `pnpm db:migrate`.
See [docs/db/migrations.md](db/migrations.md) for the full migration workflow.

### Hosted Postgres

Production's Postgres shape — image, co-location, `is_public: false` — is
documented in [Production infrastructure](operations/infrastructure.md#database);
there is no hosted connection string to configure from a laptop. Keep
`TEST_DATABASE_URL` pointed at local Postgres so `pnpm test:db:postgres` stays
isolated from hosted data. The default DB suite `pnpm test:db` (and a focused
`pnpm test:db <archivo>`) uses an in-process PGlite harness with a cached schema
snapshot instead of connecting to `TEST_DATABASE_URL`.

Schema changes against production ship as versioned Drizzle migrations, applied
by the application container at start — not with `pnpm db:migrate` from a
laptop, which has no route to the production Postgres. See
[docs/db/migrations.md](db/migrations.md). Do not point local `.env` at
production.
Database-backed tests keep two paths:

- `pnpm test:db`: default in-process `PGlite` suite backed by the cached
  schema snapshot. Runs the full `*.db.test.ts` set, or a single file with
  `pnpm test:db <archivo>`. It is also part of `pnpm test`.
- `pnpm test:db:postgres`: high-fidelity path that resets and migrates the
  schema through `TEST_DATABASE_URL` against real Postgres. Reserved for the CI gate
  on the PR (#305) and manual fidelity checks. Focus a file with
  `pnpm test:db:postgres <archivo>`.

Validation mode requirements:

- Default DB validation (`pnpm test:db`, part of `pnpm test`) does not
  require local Postgres once the repo dependencies are installed.
- High-fidelity DB validation (`pnpm test:db:postgres`)
  requires local Postgres through `TEST_DATABASE_URL`.

When local development needs production-like data, create and restore a fresh
production dump with [docs/db/production-dump.md](db/production-dump.md).

For a quick index of repo commands, see
[docs/operations/scripts.md](operations/scripts.md).

## Running Locally

From a fresh checkout, install dependencies, start Postgres, push the schema and
start the app:

```sh
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The main local auth routes are:

- `/registro`: start a public academy registration with email and password.
- `/registro/confirmar?token_hash=...&type=signup`: verify the academy email
  confirmation link and start the academy onboarding session.
- `/registro/academia`: complete academy onboarding after the email was
  confirmed.
- `/ingresar`: sign in with email and password.
- `/recuperar-acceso`: request an access recovery email.
- `/cambiar-contrasena?code=...`: complete the academy recovery flow after
  following the emailed link.
- `/invitacion/:token`: complete an internal user invitation.

## Local Email

In non-production environments, `app/lib/email.server.ts` logs messages to the
server console with an `[email:dev]` prefix and does not require provider
credentials.

Invitation links are built from the incoming request URL. Public academy
registration confirmation and recovery emails are now app-owned through Better
Auth (#420): the app builds the Spanish content and sends it via
`app/lib/shared/email.server.ts`, so in non-production the link is printed to the
server console with the `[email:dev]` prefix. Test registration locally with this
flow:

1. Run `pnpm dev`.
2. Open `http://localhost:5173/registro`.
3. Submit an email address plus password.
4. Copy the `/registro/confirmar?token_hash=...&type=signup` link from the
   `[email:dev]` console log.
5. Follow that link and complete the academy form.

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

`EMAIL_FROM` must use an address on the verified Resend sending domain. Both the
internal invitation emails and the Better Auth registration/recovery emails use
this sender.

Registration and recovery emails are app-owned through Better Auth (#420): the
app builds the Spanish content and sends it through the email boundary. The
Supabase `Send Email` Auth Hook and its `SEND_EMAIL_HOOK_SECRET` are retired.
The emails link to:

- signup confirmation: `/registro/confirmar?token_hash=...&type=signup`
- recovery: `/cambiar-contrasena?code=...`

## Legacy `sb-*` cookies

The `auth.users` → `user` reconciliation sweep (#424) was a one-off against the
cutover database, where both schemas coexisted. That database is gone (#267,
#598), so the module and its `pnpm auth:reconcile-supabase-users` command were
removed in #582.

The only Supabase Auth residue still running is
`app/lib/auth/legacy-session-cookies.server.ts`, which expires any `sb-*` cookie
a pre-cutover browser still carries. It reads no Supabase package and can be
retired once those cookies have expired everywhere; the module header states the
retirement criterion.

## Access Auth Scope

For v1, Better Auth owns academy and internal credentials, public academy
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
2. ADR [0013: Exit Supabase](adr/0013-exit-supabase.md) is the accepted
   decision record: Better Auth is the credential provider. ADRs 0001 and 0006
   are historical and superseded.
3. `.sandcastle/CODING_STANDARDS.md` controls test and implementation style.
4. Vendored React/Vercel skills are supporting references when UI or route work
   is relevant: `react-best-practices`, `web-design-guidelines`,
   `composition-patterns` and `react-view-transitions`.

## Validation Guardrail

Use this repo's validation scripts. For TypeScript validation, run:

```sh
pnpm typecheck
```

Do not run `pnpm exec tsc` directly. `pnpm typecheck` runs React Router type
generation before TypeScript checks the app.
