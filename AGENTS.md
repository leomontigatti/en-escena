# En Escena — guide for coding agents

Routes to the repo's conventions; each rule lives in the file a route names. The
first section applies to every task; a line in the second applies when its
leading word matches the task.

The skills, the agent briefs (reviewer, research, implementer) and the hooks that
depend on no project are the shared workflow in `leomontigatti/agent-workflow`,
installed at `~/.agents/workflow` for both Claude Code and Codex. A shared skill reads
this repo's facts only from the files its `contract.md` lists, which this repo keeps:
this file, [GLOSSARY.md](GLOSSARY.md), [docs/adr/](docs/adr/), `t3.json`,
[validation.md](docs/agents/validation.md), [verification.md](docs/agents/verification.md),
[review.md](docs/agents/review.md), [issue-tracker.md](docs/agents/issue-tracker.md),
[pull-requests.md](docs/agents/pull-requests.md),
[t3-dependencies.md](docs/agents/t3-dependencies.md), the TDD notes
[tdd-db.md](docs/agents/tdd-db.md) and [tdd-frontend.md](docs/agents/tdd-frontend.md),
[housekeeping.md](docs/agents/housekeeping.md), [research.md](docs/agents/research.md)
and `.agents/required-tools`. This repo's own hooks are in `.agents/hooks/`
([agent-configuration.md](docs/agents/agent-configuration.md)). In Codex, "call the
Skill tool with X" means open `~/.agents/skills/X/SKILL.md` and follow it.

## Every task

- **Session conduct**: when a step needs no input from the user, keep going, and put
  status notes in the same message as the next action. Stop and ask only when the work
  cannot continue without them, or before anything destructive: deleting data,
  force-pushing, changing anything outside this repository. When a rule in these docs
  fights the task, say so and get a sign-off before breaking it. End a run with what
  needs the user first, then what changed, then what was found in this run.
- **Implementing** (a feature, a fix, any code change): call the Skill tool with
  "implement" before editing. Where work starts and what this repo adds to the shared
  thread rules: [workflows.md](docs/agents/workflows.md).
- **Validation**: [validation.md](docs/agents/validation.md) is the whole surface; check
  [scripts.md](docs/operations/scripts.md) before running a command it does not list.
- **Subagents**: reviewers spawn as "Spawning a reviewer" in the `code-review` skill says,
  research as [agent-configuration.md](docs/agents/agent-configuration.md#delegating-to-subagents) says.
- **Coding standards** (code language included: code, commits and PRs in English, the
  user's Spanish only where a user reads it):
  [coding-standards.md](docs/agents/coding-standards.md); identifiers map to UI terms in
  [GLOSSARY.md](GLOSSARY.md); test-support files go where
  [Test support files](docs/agents/coding-standards.md#test-support-files) says.
- **Docs layout**: `docs/agents/` operative rules, `docs/domain/` the model, `docs/adr/`
  decisions, `docs/operations/` runbooks; what earns a paragraph:
  [workflows.md](docs/agents/workflows.md#documentation).

## When routed

- **Commands**: [scripts.md](docs/operations/scripts.md) indexes every `pnpm` script; read
  the runbook of a ⚠️ row first. "Refresh the local db" is `pnpm db:refresh:prod`, which
  replaces the **development** database; `pnpm db:test:reset` is the **test** database.
- **Code placement**, **routes and layouts**: [codebase-map.md](docs/agents/codebase-map.md).
- **Documentation**: [workflows.md](docs/agents/workflows.md#documentation).
- **UI verification**: [verification.md](docs/agents/verification.md).
- **Review tiers** and risky areas: [review.md](docs/agents/review.md).
- **Style guide** (frontend/UI): [style-guide.md](docs/agents/style-guide.md).
- **shadcn/ui** (before re-adding a component the CLI would overwrite):
  [shadcn.md](docs/agents/shadcn.md).
- **Form feedback and redirection**: [form-feedback.md](docs/agents/form-feedback.md).
- **Pull requests**: [pull-requests.md](docs/agents/pull-requests.md).
- **Issues**, **PRDs**, **triage labels**: [issue-tracker.md](docs/agents/issue-tracker.md).
- **Domain docs**: [domain.md](docs/agents/domain.md).
- **CI**, **dependencies**: [ci.md](docs/operations/ci.md).
- **Agent configuration** (the shared workflow, this repo's hooks, subagent wiring):
  [agent-configuration.md](docs/agents/agent-configuration.md).
- **Local database and auth**: [local-auth.md](docs/local-auth.md).
- **Production infrastructure**: [infrastructure.md](docs/operations/infrastructure.md).
- **Staging** (`pruebas.enescena.com.ar`): [staging.md](docs/operations/staging.md).
- **DNS and email**: [dns-and-email.md](docs/operations/dns-and-email.md).
- **Fallow**: [fallow.md](docs/agents/fallow.md).
- **Architecture Review** (the weekly T3 Code scheduled task):
  [architecture-review.md](docs/agents/architecture-review.md).
- **T3 Code dependencies** (what a T3 update can break or simplify):
  [t3-dependencies.md](docs/agents/t3-dependencies.md).
- **Housekeeping** (worktrees, branches, per-worktree databases):
  [housekeeping.md](docs/agents/housekeeping.md).
