## Agent skills

### Codex workflows

Codex should follow the project workflows in `docs/agents/codex-workflows.md`.

Important command rule: do not run `npx tsc` for validation in this repo. Use `npm run typecheck` so React Router route types are generated before TypeScript runs.

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

Local database, Better Auth and email-log operation are documented in
`docs/local-auth.md`.
