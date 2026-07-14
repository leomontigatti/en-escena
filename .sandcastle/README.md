# Sandcastle

Sandcastle runs the project issue workflow with isolated Docker worktrees.

## Setup

Create `.sandcastle/.env` from `.sandcastle/.env.example` and set:

- `GH_TOKEN` only if Sandcastle should use a specific GitHub token. It must have
  Issues read/write and Metadata read access. If this is empty, Sandcastle falls
  back to the host `gh auth token` login and passes that token to Docker
  sandboxes.
- `CLAUDE_CODE_OAUTH_TOKEN` (recommended) or `ANTHROPIC_API_KEY` — the Claude
  Code credentials injected into each sandbox. See the auth section below.
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

Sandcastle drives the Claude Code CLI inside each sandbox. Authentication uses a
subscription OAuth token (recommended, does not consume API credits). Generate
one on the host and put it in `.sandcastle/.env`:

```bash
claude setup-token
```

Copy the printed token into `CLAUDE_CODE_OAUTH_TOKEN`. To use an Anthropic
Platform API key instead, set `ANTHROPIC_API_KEY` and leave the OAuth token
empty. The runner verifies that one of the two is configured, then injects it as
an environment variable into each Docker sandbox — no host auth file is mounted.
Each sandbox writes its own Claude sessions and logs locally inside the
container.

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

The planner only loads open issues labeled `ready-for-agent`. Native GitHub
sub-issues are valid implementation targets when they have that label; parent
PRDs, epics, and tracking issues should not carry `ready-for-agent`.

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
`ready-for-agent`, and works on `sandcastle/issue-<number>`. If the issue has a
native GitHub parent, Sandcastle includes the parent issue context in the
implementer prompt.

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
