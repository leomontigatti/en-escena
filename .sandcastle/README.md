# Sandcastle

Sandcastle runs the project issue workflow with isolated Docker worktrees.

## Setup

Create `.sandcastle/.env` from `.sandcastle/.env.example` and set:

- `OPENAI_KEY`: OpenAI API key used by Codex.
- `GH_TOKEN`: GitHub token with Issues read/write and Metadata read access.

The repository must have at least one commit before Sandcastle runs. Sandcastle
creates Git worktrees from `HEAD`, so an unborn branch such as `No commits yet on
master` cannot be used as the base.

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

Do not use `npx tsc` directly in this repo. `npm run typecheck` generates React
Router route types before running TypeScript.
