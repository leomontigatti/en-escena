# En Escena — guide for Claude Code

Index of the repo's conventions. Every operative rule lives in its own file under
`docs/agents/` (or `.sandcastle/`); this file only routes.

- **Session conduct**: when a step needs no input from the user, keep going, and
  put status notes in the same message as the next action. Stop and ask only when
  the work cannot continue without them, or before anything destructive: deleting
  data, force-pushing, changing anything outside this repository. When a rule in
  these docs fights the task, say so and get a sign-off before breaking it. End a
  run with what needs the user first, then what changed, then what was found.
- **Validation**: [docs/agents/workflows.md](docs/agents/workflows.md).
  Use `pnpm typecheck` (not `pnpm exec tsc`); a hook enforces it. Do not run
  `pnpm typecheck` in parallel with `pnpm build`. **The commands listed there are
  the whole validation surface — check the script index below before running one
  that is not, rather than after it fails.** `pnpm lint` is oxlint over what
  `.oxlintrc.json` enables — React hook mistakes, import cycles and un-awaited
  promises — and is not a style checker; formatting is Prettier's, unused code is
  `tsc`'s, and repo conventions belong to the `check:*` scripts.
- **Every other command**: [docs/operations/scripts.md](docs/operations/scripts.md)
  is the complete index of `pnpm` scripts — databases, backups, the AFK workflows —
  each with a link to its runbook. A command that is not there is not a script of
  this repo. Rows marked ⚠️ reach outside the repo or destroy local state; read
  the runbook before running one. Mind the neighbours: `pnpm db:refresh:prod`
  replaces the local **development** database from a production backup artifact,
  while `pnpm db:test:reset` resets the separate **test** database — "refresh the
  local db" means the first.
- **Branches, worktrees and T3 Code threads** (each thread works in its own T3
  worktree, link every PR to the thread):
  see the section of the same name in [docs/agents/workflows.md](docs/agents/workflows.md).
- **Investigate before implementing**: see the section of the same name in
  [docs/agents/workflows.md](docs/agents/workflows.md).
- **Implementing** (a feature, a fix, any code change) happens in a local session: call the
  Skill tool with "implement" before editing. Why local and not on GitHub Actions is ADR-0016.
  Work too big for one issue becomes a PRD with `/to-spec`, sliced with `/to-tickets`: see
  "Where work starts" in [docs/agents/workflows.md](docs/agents/workflows.md).
- **Documentation** (when a change needs a doc change, which is rarely, and where it goes):
  see the section of the same name in [docs/agents/workflows.md](docs/agents/workflows.md).
- **Coding standards**: [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md)
  (canonical). Guide for the whole repo, not just for Sandcastle. Includes the code
  language convention (Spanish for what the user reads, English for everything else;
  `comprobante` as the only reserved term). The identifier → UI term mapping lives in
  [CONTEXT.md](CONTEXT.md).
- **Style guide** (frontend/UI): [docs/agents/style-guide.md](docs/agents/style-guide.md).
- **UI verification** (a rendered change is checked in a real browser with `playwright-cli`
  against `pnpm db:seed` data, with before/after screenshots): see the section of the same
  name in [docs/agents/workflows.md](docs/agents/workflows.md).
- **shadcn/ui** (upstream sync policy, and which local divergences are deliberate):
  [docs/agents/shadcn.md](docs/agents/shadcn.md). Read it before re-adding a component the
  CLI would overwrite.
- **Form feedback and redirection** (stay/redirect matrix, flash session vs. direct
  `actionData`): [docs/agents/form-feedback.md](docs/agents/form-feedback.md).
- **Pull requests** (short body shape, UI evidence, babysitting a PR):
  [docs/agents/pull-requests.md](docs/agents/pull-requests.md).
- **Issue tracker** (GitHub Issues via `gh`): [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels**: [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** (single-context layout): [docs/agents/domain.md](docs/agents/domain.md).
- **Local operation and auth** (DB, access auth, email-log): [docs/local-auth.md](docs/local-auth.md).
- **Production infrastructure** (VPS, Coolify app, Postgres resource, storage
  volume — current state; the rationale is ADR-0013):
  [docs/operations/infrastructure.md](docs/operations/infrastructure.md).
- **DNS and email** (zone on Cloudflare, inbound via Email Routing, outbound via
  Resend): [docs/operations/dns-and-email.md](docs/operations/dns-and-email.md).
- **Fallow** (commit gate via `pnpm check:fallow`, and investigation tool):
  [docs/agents/fallow.md](docs/agents/fallow.md).
- **AFK platform** (three workflows remain: Update Branch, Promote Queued, Architecture
  Review; the implement, review and To Issues runners were retired in ADR-0016). The
  vendored spec of the original 8 is [docs/agents/afk-agent-platform-spec.md](docs/agents/afk-agent-platform-spec.md);
  what was adapted is in [docs/agents/afk-vendored-assets.md](docs/agents/afk-vendored-assets.md).
- **AFK operational setup** (`agent:*` labels, secrets, degradation without a PAT; runbook
  for spec §3.1/§3.4): [docs/agents/afk-setup.md](docs/agents/afk-setup.md).
