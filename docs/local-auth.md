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

### One database per worktree

The container is shared by every checkout, but each worktree gets its own
database in it, `en-escena-wt-<worktree>`, created on first use: the first
`pnpm dev`, `pnpm db:seed` or `pnpm db:migrate` in a worktree without
`.env.local` creates, migrates and seeds it, and writes a gitignored `.env.local` with its `DATABASE_URL` and a
dev server `PORT` no other worktree claims (`APP_URL` and `BETTER_AUTH_URL`
follow the port). `react-router dev` and every `db:*` script load `.env.local`
over the `.env` linked from the main checkout, so a session's seed, migrations,
refresh and screenshots touch only its own data, and a thread that never needs
data (grilling, research, review) never gets a database. `pnpm db:worktree`
runs the same setup by hand; re-running it is safe: it migrates, and seeds only
a database it just created. The dev server holds its port strictly and fails when another process
has it, rather than moving to a port the session did not expect.

`pnpm worktree:sweep` removes finished worktrees and drops their databases (see
[workflows.md](agents/workflows.md#branches-worktrees-and-t3-code-threads)). The main checkout keeps
`en-escena`; `TEST_DATABASE_URL` and the storage directory stay shared.

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
pnpm db:seed
pnpm dev
```

Then sign in at `/ingresar` with one of the demo accounts below.

### Demo data

`pnpm db:seed` (`scripts/seed-dev.ts`, logic in `app/lib/dev-seed/`) is the
primary way to get a local login. It creates, on the local `DATABASE_URL`:

- `admin@enescena.local`: an internal administrator, landing on
  `/administracion`.
- `academia@enescena.local`: an academy user with its `Academia Demo`, landing
  on `/portal`.
- `auditoria@enescena.local` and `jurado@enescena.local`: an auditor and a
  judge, landing on `/auditoria` and `/juzgamiento`. The judge is assigned to
  both afternoon presentations: they scored `Río Arriba` 87, and
  administration disqualified `Viento Sur`.
- All four are email-verified and share one password, `DEV_SEED_PASSWORD` in
  `app/lib/dev-seed/seed.server.ts`; the command prints it.
- Three events: `Evento Activo` (active, 60 days out), `Evento Futuro` and
  `Evento Finalizado`. The active one has a catalog registrations accept: a
  modality with two submodalities (`Lírico`, `Contemporáneo`), two categories
  covering ages 1 to 100, two
  schedules on the same day (`Bloque mañana`, `Bloque tarde`) open for
  registrations with a solo capacity each, and a solo price.
- Four dancers and two professors in `Academia Demo`, and four choreographies
  on the active event, each in a different state:

  | Choreography    | Dancer, block   | State                                                                                                  |
  | --------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
  | `Luna de Papel` | Ana, morning    | Deposit paid and numbered; open to correction.                                                         |
  | `Viento Sur`    | Bea, afternoon  | Deposit paid, numbered, disqualified by administration.                                                |
  | `Río Arriba`    | Caro, afternoon | Deposit paid, numbered, scored 87 by the demo judge under `Contemporáneo`, and invoiced (`Factura C`). |
  | `Sal y Arena`   | Dani, morning   | Nothing paid, and registered after the ordering, so it has no number.                                  |

- One payment from `Academia Demo`, allocated past the deposit of the three
  paid inscriptions, so the payment's academy and each of those inscriptions'
  price show their locks. The two afternoon presentations count as evaluated,
  which freezes that schedule's numbers; the score locks the criteria of
  `Contemporáneo` and leaves `Lírico`'s editable.
- One comprobante, `9999-00000001`, for what `Río Arriba` paid. It goes through
  the real emission with a stand-in for ARCA, on sales point 9999 so its number
  cannot collide with a real one. Its CAE is the manual's example and its issuer
  CUIT a placeholder: it is not a fiscal document.

To read the data directly, the tables are `en_escena_<singular>`
(`en_escena_choreography`, `en_escena_comprobante`); `\dt en_escena_*` in
`psql` lists them.

It writes to the `DATABASE_URL` in effect — the worktree's own database when
`.env.local` exists (see [One database per worktree](#one-database-per-worktree)).
Re-running it resets the demo: everything hanging off those two emails and
those three event names is deleted first — including what was created on them
through the UI — and created again. Only one event can be active, so any other
active event is deactivated, and the command names it. It refuses to run
unless `DATABASE_URL`'s host is `localhost` or `127.0.0.1`: the password is
published here, and screenshots taken against this data go into a public
repository ([pull-requests.md](agents/pull-requests.md#ui-evidence)).

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

In non-production environments, `app/lib/shared/email.server.ts` logs messages to the
server console with an `[email:dev]` prefix and does not require provider
credentials.

Invitation links are built from the incoming request URL. Public academy
registration confirmation and recovery emails are now app-owned through Better
Auth (#420): the app builds the Spanish content and sends it via
`app/lib/shared/email.server.ts`, so in non-production the link is printed to the
server console with the `[email:dev]` prefix. The demo accounts above skip this
flow; to test registration itself, or as an alternative to the seed, use it:

1. Run `pnpm dev`.
2. Open `/registro` on the dev server: `http://localhost:5173/registro` in the
   main checkout, the `PORT` from `.env.local` in a worktree.
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
- Internal password recovery remains an administrative reset that sets the new
  password outright; internal users do not receive recovery emails.
- Roles, academy ownership, internal usernames and suspension are app-domain
  data. Do not put authorization
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
3. `docs/agents/coding-standards.md` controls test and implementation style.
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
