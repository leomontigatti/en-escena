## Agent skills

### Codex workflows

Codex should follow the project workflows in `docs/agents/codex-workflows.md`.

Important command rule: do not run `pnpm exec tsc` for validation in this repo. Use `pnpm typecheck` so React Router route types are generated before TypeScript runs. Do not run `pnpm typecheck` in parallel with `pnpm build`; run them sequentially because the build regenerates `build/`.

### Coding standards

All code changes should follow [docs/agents/coding-standards.md](docs/agents/coding-standards.md). Treat it as repo-wide guidance, not Sandcastle-only guidance.

### Style guide

Frontend and UI changes should follow [docs/agents/style-guide.md](docs/agents/style-guide.md), including the En Escena color tokens, spacing, typography, shadcn/ui conventions, and Spanish UI tone.

### Issue tracker

Issues are tracked in GitHub Issues for `leomontigatti/en-escena` using the `gh` CLI. See `docs/agents/issue-tracker.md`.
Use `gh` directly for GitHub operations in this repo, including creating,
reading, editing, labeling, commenting on issues, and inspecting PRs/checks. Do
not use the GitHub connector/MCP app tools for this repo; they may have narrower
permissions than the local `gh` auth and can fail with misleading access errors.

### Triage labels

Triage labels use the default mattpocock/skills vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.

### Local operation and auth

Local database, Supabase Auth and email-log operation are documented in
`docs/local-auth.md`.

---

<!-- fallow:setup-hooks:start -->

## Fallow audit tools

Use Fallow as an audit and investigation tool, not as a required local commit
or push gate. Run `pnpm exec fallow audit --format json --quiet --explain
--gate-marker agent` when explicitly auditing a changeset, preparing a PR
handoff, or investigating maintainability findings.

Audit defaults to `gate=new-only`: only findings introduced by the current
changeset affect the verdict. Inherited findings on touched files are reported
under `attribution` and annotated with `introduced: false`. Treat JSON runtime
errors like `{ "error": true, ... }` as non-blocking.

For non-skill agents, treat the task map below as the local onboarding source
for optional audits and targeted investigations.

## Fallow task map

| When the agent is about to...     | Run                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| delete an "unused" export or file | `pnpm exec fallow dead-code --trace <file>:<export>`                                 |
| delete an "unused" dependency     | `pnpm exec fallow dead-code --trace-dependency <name>`                               |
| audit a changeset or PR handoff   | `pnpm exec fallow audit --base <ref>`                                                |
| prioritize refactoring            | `pnpm exec fallow health --hotspots --targets`                                       |
| ask who owns code                 | `pnpm exec fallow health --ownership`                                                |
| check untested-but-reachable code | `pnpm exec fallow health --coverage-gaps`                                            |
| consolidate duplication           | `pnpm exec fallow dupes --trace dup:<fingerprint>`                                   |
| find feature flags                | `pnpm exec fallow flags`                                                             |
| surface security candidates       | `pnpm exec fallow security`                                                          |
| understand a finding              | `pnpm exec fallow explain <issue-type>`                                              |
| scope a monorepo                  | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |

<!-- fallow:setup-hooks:end -->
