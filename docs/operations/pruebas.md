# Pruebas

Pruebas is a second deployment of the app, at `https://pruebas.enescena.com.ar`,
that runs on a copy of production's data for specific tests: rehearsing a
judging day, recording a walkthrough, trying a branch against real rows before
it ships. It is off when nothing is being tested.

It is a production build, so `NODE_ENV` cannot tell it apart from production.
`APP_ENVIRONMENT=pruebas` does, and everything pruebas does differently hangs
off that marker (`app/lib/shared/app-environment.server.ts`):

- every page shows a **PRUEBAS** banner and asks not to be indexed;
- email is written to the container log with an `[email:pruebas]` prefix
  instead of being sent, because every address in it is a real person's.

## Resources

All on `rylai`, in the `pruebas` environment of the `enescena` Coolify project.

| Resource    | Coolify UUID               | Notes                                                                                            |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| Application | `ojdw5oppaq326mgohwvqew1s` | `enescena-pruebas`; deploys a branch by hand, like production.                                   |
| Postgres    | `jjhyytvgi9suem6e8sygshvp` | `postgres:17-alpine`, database `enescena`, not public. No backups.                               |
| Storage     | Docker volume              | `ojdw5oppaq326mgohwvqew1s-en-escena-pruebas-filestore`, mounted where production mounts its own. |

DNS is an `A` record to `rylai`, proxied through Cloudflare like `sistema`:
`rylai` only accepts `443` from Cloudflare. The WAF and rate-limiting rules in
[DNS and email](./dns-and-email.md#24-proxy-and-waf-over-sistema) are scoped to
`sistema` and do not cover it.

What it holds, against production:

- **Own secrets**: `BETTER_AUTH_SECRET` and `STORAGE_URL_SIGNING_SECRET` are its
  own, so no session or signed link crosses between the two.
- **Same ARCA configuration**, test service included (`ARCA_PRODUCTION=false`).
  Check that production still says `false` before relying on it; if it has gone
  live, pruebas must keep `false` and get the homologation certificate.
- **No backup credentials**: no `AWS_*`, `B2_*`, `STORAGE_BACKUP_BUCKETS` or
  `COOLIFY_BACKUP_BUCKET`, and no scheduled tasks. Nothing it does reaches
  production's buckets.
- **Email credentials, gated**: `EMAIL_FROM` and `RESEND_API_KEY` are set so a
  test that needs a real email only has to add `PRUEBAS_SEND_EMAIL=true` and
  restart. Remove it again when the test is done.

## Using it

1. Start the Postgres and the application from Coolify. To try a branch, set
   the application's branch first and deploy.
2. Reset it to production as it is now:

   ```sh
   pnpm pruebas:reset
   ```

   It dumps the live database (read-only), stops the app, replaces pruebas'
   database with the dump, mirrors production's storage into pruebas' volume,
   and starts the app again. The entrypoint then applies whatever migrations
   the deployed branch adds. Reset before every round of tests: whatever
   pruebas held is gone.

3. Sign in with the same email and password as in production: the accounts
   come with the copy. A recovery or invitation link is in the app's log in
   Coolify, under `[email:pruebas]`.
4. Stop both resources when done. They hold a full copy of production's
   personal data, so do not leave them up between tests.

Pruebas shares `rylai` with production. A load test there competes with the
live site for the same two CPUs: never run one during an event.

### A judging day that is not today

Judges can only score on the judging day (`app/lib/judging/judging-day.ts`),
and the panel locks a schedule's date once choreographies occupy it. To
rehearse or film judging on another day, move the schedule's date to today in
pruebas' database directly, then assign the judges from the administration
panel. The next reset undoes it:

```sh
ssh rylai "docker exec jjhyytvgi9suem6e8sygshvp psql -U postgres -d enescena \
  -c \"update en_escena_schedule set scheduled_date = '<YYYY-MM-DD>' where id = '<schedule id>'\""
```

Never against production's container: check the UUID.
