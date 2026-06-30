# Production Schema Push

Use this runbook when the local Drizzle schema is ready to be applied to the
production Supabase Postgres database.

For the normal workflow, run:

```sh
pnpm db:push:prod
```

The script prompts for the production Postgres URL, rejects localhost targets,
shows the target host, requires an explicit confirmation phrase, and runs
`drizzle-kit push --config=drizzle.config.ts` with the production URL only in
the subprocess environment. The URL is not written to disk.

The confirmation phrase is:

```text
push schema to production
```

Use the Supabase dashboard Postgres connection string, not `SUPABASE_URL`. The
direct connection or session pooler is the best fit for schema pushes. Avoid the
transaction pooler for this operation.

## Before Pushing

Validate the change locally first:

```sh
docker compose up -d postgres
pnpm db:push
pnpm typecheck
```

Run the relevant tests for the schema change before touching production. For
database-backed behavior, use the focused DB test while iterating and the full
DB suite before release:

```sh
pnpm test:db:file <path-to-db-test>
pnpm test:db
```

If the schema change affects routing, server rendering, bundling, CSS, or
deployment behavior, run:

```sh
pnpm build
```

## Push To Production

Run:

```sh
pnpm db:push:prod
```

Paste the production `DATABASE_URL` only when prompted. Do not commit it to
`.env`, documentation, shell history, or logs.

When the script shows the target host, confirm it is the intended Supabase
project before typing the confirmation phrase.

## After Pushing

Smoke-test the deployed application path that depends on the schema change.
When the change is risky, also refresh a local copy of production data and
verify the relevant flow against it:

```sh
pnpm db:refresh:prod
pnpm dev
```
