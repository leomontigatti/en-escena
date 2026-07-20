# `.sandcastle/` — AFK agent runners

This directory holds the **AFK agent runners** invoked by the GitHub Actions
workflows in `.github/workflows/agent-*.yml` and `architecture-review.yml`. It
implements the **orchestrator↔runner split** of the AFK platform spec
(`docs/agents/afk-agent-platform-spec.md`, §3.8/§3.9): the workflow
(orchestrator) owns every tracker/VCS mutation (labels, comments, push, PR,
close) and prefetches context; each **runner holds no GitHub token** and only
emits commits on the already-checked-out branch plus plain/JSON files under
`OUTPUT_DIR`.

The legacy local Docker runner (`main.mts` and its `*-prompt.md` chain, driven
by `pnpm sandcastle`) was **retired in the Fase 4 cutover** (issue #347). The
development flow is now **AFK-on-GHA with human merge**: label an issue/PR to
trigger the relevant workflow → the agent produces changes on a branch → a draft
PR is opened → a human merges. Work can also be done manually (Claude Code on a
branch/worktree → PR → human merge); that path stays available for iterating on
the runners themselves.

## Layout

- `agent-implement/`, `agent-write-pr/`, `agent-review/`, `agent-implement-pr/`,
  `agent-update-branch/`, `agent-architecture-review/`, `agent-to-issues/`,
  `agent-implement-prd/`, `agent-write-prd-pr/` — one directory per runner,
  invoked by the matching workflow.
- `lib/` — shared runner helpers (`runner.mts`, `run-with-extraction.mts`, …).
- `run-with-retry.mts`, `retry-feedback.mts` — shared output/retry helpers used
  by several runners.
- `CODING_STANDARDS.md` — canonical coding standards for the whole repo (not
  just these runners); referenced from `CLAUDE.md`.

The runners run on the GitHub Actions host with `noSandbox()` (see
`lib/runner.mts`); they need no local `.env` and no Docker image. Auth and
tokens are provided by the workflow via GitHub Actions secrets — see
`docs/agents/afk-setup.md`.

## Validation Rules

Runner prompts must preserve this repo's validation order:

1. `pnpm format` when formatting needs to be applied, otherwise
   `pnpm format:check` for final formatting verification
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm check:file-tokens`
4. `pnpm typecheck`
5. `pnpm test` (unit/react plus the DB suite on in-process PGlite; also covers
   database schema, repositories, loaders/actions that persist data, or
   persistence-backed business rules)
6. `pnpm build` when the change touches routing, server rendering, bundling,
   CSS, or deployment behavior

If a command fails, fix it and rerun that same command before starting the next
validation command. Do not run `typecheck`, tests, DB tests, or build while
formatting, `format:check`, repo-style checks, or file-token checks are still
broken.

`pnpm check:file-tokens` is strict for staged application source files. Split
files at real module boundaries before committing instead of adding shallow
pass-through wrappers to satisfy the token limit.

During development, focused DB tests can target one file:

```bash
pnpm test:db app/lib/example.db.test.ts
```

Focused DB tests use the fast in-process PGlite harness. Run `pnpm test` before
finishing database-backed work; it covers the unit suite and the full PGlite DB
suite with no local Postgres. `pnpm test:db:postgres` is the high-fidelity
real-Postgres path, reserved for the CI gate on the PR (`ci.yml`, issues
#305/#342).

Do not use `pnpm exec tsc` directly in this repo. `pnpm typecheck` generates
React Router route types before running TypeScript.
