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
Compose service hostname `postgres`. This lets agents run `npm run test:db` for
persistence-backed changes without accidentally using the host development
database URL.

Issue sandboxes get isolated test databases derived from the base URL. For
example, issue 34 uses `en-escena-test-issue-34`, and the merge phase uses
`en-escena-test-merger`. The DB test setup creates these databases on demand.

## Running

Run the normal planner workflow:

```bash
npm run sandcastle
```

The planner only loads open issues labeled `ready-for-agent`.

Run a single issue without changing labels on the rest of the backlog:

```bash
npm run sandcastle -- --issue 4
```

Equivalent forms:

```bash
npm run sandcastle -- 4
npm run sandcastle -- --issue=4
npm run sandcastle -- -i 4
```

Single-issue mode skips the planner, verifies that the issue is open and labeled
`ready-for-agent`, and works on `sandcastle/issue-<number>`.

## Validation Rules

Sandcastle prompts must preserve this repo's validation order:

1. `npm run format:check`
2. `npm run typecheck`
3. `npm test`
4. `npm run test:db` when the change touches database schema, repositories,
   loaders/actions that persist data, or persistence-backed business rules

Do not use `npx tsc` directly in this repo. `npm run typecheck` generates React
Router route types before running TypeScript.
