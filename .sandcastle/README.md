# Sandcastle

Sandcastle runs the project issue workflow with isolated Docker worktrees.

## Setup

Create `.sandcastle/.env` from `.sandcastle/.env.example` and set:

- `GH_TOKEN`: GitHub token with Issues read/write and Metadata read access. The
  single-issue preflight also uses this token to read the selected issue.
- `CODEX_AUTH_JSON` only if your Codex auth file is not at
  `~/.codex/auth.json`.
- `SANDCASTLE_DOCKER_NETWORK` only if your Docker Compose network is not
  `en-escena_default`.
- `SANDCASTLE_TEST_DATABASE_URL` only if Sandcastle should use a different base
  test database URL than
  `postgres://postgres:postgres@postgres:5432/en-escena-test`.

The repository must have at least one commit before Sandcastle runs. Sandcastle
creates Git worktrees from `HEAD`, so an unborn branch such as `No commits yet on
master` cannot be used as the base.

After changing `.sandcastle/Dockerfile`, rebuild the sandbox image:

```bash
pnpm exec sandcastle docker build-image
```

Sandcastle uses the host Codex CLI ChatGPT login, not an OpenAI Platform API
key. Run this on the host before starting Sandcastle:

```bash
codex login
codex login status
```

The runner verifies that `codex login status` reports ChatGPT auth, then mounts
only the host Codex auth file into each Docker sandbox at
`/home/agent/.codex/auth.json`. The mount is read-only; each sandbox writes its
own Codex sessions and logs locally inside the container.

For database tests, start PostgreSQL before running Sandcastle:

```bash
docker compose up -d postgres
```

Sandcastle containers attach to the `en-escena_default` Docker network by
default and receive `DATABASE_URL` and `TEST_DATABASE_URL` pointing at the
Compose service hostname `postgres`. This lets agents run `pnpm test:db` for
persistence-backed changes without accidentally using the host development
database URL.

Issue sandboxes get isolated test databases derived from the base URL. For
example, issue 34 uses `en-escena-test-issue-34`, and the merge phase uses
`en-escena-test-merger`. The DB test setup creates these databases on demand.

## Running

Run the normal planner workflow:

```bash
pnpm sandcastle
```

The planner only loads open issues labeled `ready-for-agent`.

Run a single issue without changing labels on the rest of the backlog:

```bash
pnpm sandcastle -- --issue 4
```

Equivalent forms:

```bash
pnpm sandcastle -- 4
pnpm sandcastle -- --issue=4
pnpm sandcastle -- -i 4
```

Single-issue mode skips the planner, verifies that the issue is open and labeled
`ready-for-agent`, and works on `sandcastle/issue-<number>`.

## Validation Rules

Sandcastle prompts must preserve this repo's validation order:

1. `pnpm format` when formatting needs to be applied, otherwise
   `pnpm format:check` for final formatting verification
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm check:file-tokens`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm test:db` when the change touches database schema, repositories,
   loaders/actions that persist data, or persistence-backed business rules
7. `pnpm build` when the change touches routing, server rendering, bundling,
   CSS, or deployment behavior

If a command fails, fix it and rerun that same command before starting the next
validation command. Do not run `typecheck`, tests, DB tests, or build while
formatting, `format:check`, repo-style checks, or file-token checks are still
broken.

`pnpm check:file-tokens` is strict for staged application source files.
Sandcastle agents should split files at real module boundaries before committing
instead of adding shallow pass-through wrappers to satisfy the token limit.

During development, focused DB tests can target one file:

```bash
pnpm test:db:file -- app/lib/example.db.test.ts
```

Focused DB tests use the fast PGlite harness. Use full `pnpm test:db` before
finishing database-backed work; it is the reliable Postgres path through
`TEST_DATABASE_URL`. `pnpm test:db:fast:full` is an experimental full PGlite
suite for harness debugging, not a final confidence check.

Do not use `pnpm exec tsc` directly in this repo. `pnpm typecheck` generates React
Router route types before running TypeScript.
