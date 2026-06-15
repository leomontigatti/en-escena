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

### Vendored reference skills

Selected Vercel Labs agent skills are vendored under `docs/agents/vendor/vercel-labs/agent-skills/`.
Selected Better Auth agent skills are vendored under `docs/agents/vendor/better-auth/skills/`.
Use them as reference material when relevant, but keep this repo's workflows, glossary, and coding standards authoritative.

Better Auth skills:

- `better-auth/best-practices`: Better Auth server/client setup, adapters, session, and migration guidance.
- `better-auth/create-auth`: setup workflow guidance for adding Better Auth to TypeScript apps.
- `better-auth/emailAndPassword`: email/password, verification, password reset, and password policy guidance.
- `security`: general Better Auth security review guidance.

Excluded Better Auth skills:

- `better-auth/organization`: excluded because this repo models `Academia` in the app domain and does not use Better Auth organizations in v1.
- `better-auth/twoFactor`: excluded until 2FA becomes an explicit product requirement.

Vercel Labs skills:

- `react-best-practices`: React performance and data-fetching review guidance.
- `web-design-guidelines`: UI, accessibility, UX, and frontend quality review guidance.
- `composition-patterns`: React component API and composition refactoring guidance.
- `react-view-transitions`: route and component transition guidance for React view transitions.
- `vercel-optimize`: post-deploy Vercel cost, performance, and reliability audit guidance.
- `writing-guidelines`: docs and product prose review guidance.
