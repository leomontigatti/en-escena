# En Escena — guide for Claude Code

Index of the repo's conventions. Every operative rule lives in its own file under
`docs/agents/` (or `.sandcastle/`); this file only routes.

- **Commands and validation**: [docs/agents/workflows.md](docs/agents/workflows.md).
  Use `pnpm typecheck` (not `pnpm exec tsc`); a hook enforces it. Do not run
  `pnpm typecheck` in parallel with `pnpm build`. **The commands listed there are
  the whole surface — check `package.json` before running one that is not, rather
  than after it fails.** `pnpm lint` is oxlint with three rules (hook mistakes and
  import cycles) and is not a style checker; formatting is Prettier's, unused code
  is `tsc`'s, and repo conventions belong to the `check:*` scripts.
- **Investigate before implementing**: see the section of the same name in
  [docs/agents/workflows.md](docs/agents/workflows.md).
- **Coding standards**: [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md)
  (canonical). Guide for the whole repo, not just for Sandcastle. Includes the code
  language convention (Spanish for what the user reads, English for everything else;
  `comprobante` as the only reserved term). The identifier → UI term mapping lives in
  [CONTEXT.md](CONTEXT.md).
- **Style guide** (frontend/UI): [docs/agents/style-guide.md](docs/agents/style-guide.md).
- **Form feedback and redirection** (stay/redirect matrix, flash session vs. direct
  `actionData`): [docs/agents/form-feedback.md](docs/agents/form-feedback.md).
- **Issue tracker** (GitHub Issues via `gh`): [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels**: [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** (single-context layout): [docs/agents/domain.md](docs/agents/domain.md).
- **Local operation and auth** (DB, access auth, email-log): [docs/local-auth.md](docs/local-auth.md).
- **Production infrastructure** (VPS, Coolify app, Postgres resource, storage
  volume — current state; the rationale is ADR-0013):
  [docs/operations/infrastructure.md](docs/operations/infrastructure.md).
- **DNS and email** (zone on Cloudflare, inbound via Email Routing, outbound via
  Resend): [docs/operations/dns-and-email.md](docs/operations/dns-and-email.md).
- **Fallow** (audit and investigation, not a commit gate): [docs/agents/fallow.md](docs/agents/fallow.md).
- **AFK platform** (spec of the 8 workflows, source of truth; vendored from Matt Pocock):
  [docs/agents/afk-agent-platform-spec.md](docs/agents/afk-agent-platform-spec.md); what was
  adapted is in [docs/agents/afk-vendored-assets.md](docs/agents/afk-vendored-assets.md).
- **AFK operational setup** (`agent:*` labels, secrets, degradation without a PAT; runbook
  for spec §3.1/§3.4): [docs/agents/afk-setup.md](docs/agents/afk-setup.md).
