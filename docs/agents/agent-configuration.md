# Agent configuration

How Claude Code and Codex share this repo's instructions, skills, hooks and
subagents, and how a session delegates to a subagent.

## The shared workflow and this repo

The skills, the agent briefs and the hooks that depend on no project are not in this repo: they
are the shared workflow, `leomontigatti/agent-workflow`, installed once per machine at
`~/.agents/workflow` by its `install.sh`, which links the skills into `~/.agents/skills` (Codex)
and `~/.claude/skills` (Claude Code), the agent wrappers into `~/.claude/agents` and
`~/.codex/agents`, and wires the shared hooks at user level. Which model each agent role runs on
is the shared `agents/models.md`. A shared skill reads this repo's facts only from the files its
`contract.md` lists; `AGENTS.md` names them.

What stays here:

| What              | Where                                 | Claude Code reads it through                                      | Codex reads it through |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| Repo instructions | `AGENTS.md`                           | `AGENTS.md` directly (2.1.277+, only while no `CLAUDE.md` exists) | `AGENTS.md` directly   |
| Project hooks     | `.agents/hooks/*.sh`                  | the `hooks` block of `.claude/settings.json`                      | `.codex/hooks.json`    |
| Tools on PATH     | `.agents/required-tools`              | the shared `check-tool-path` hook                                 | the same               |
| A project skill   | `.agents/skills/<name>/` (none today) | `.claude/skills`, a symlink to `.agents/skills`, to recreate      | `.agents/skills`       |

- **`AGENTS.md` is the only instructions file**, here and in every parent directory: Claude
  Code reads `AGENTS.md` only as a fallback, when no `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md` sits in the working directory or above it, so adding one would silently
  stop it reading these instructions. Claude-only notes go in `~/.claude/CLAUDE.md`, which
  does not count.
- **A change to a shared skill** is a PR to `leomontigatti/agent-workflow`, never a copy here. A
  skill only this repo uses goes in `.agents/skills/<name>/`, under a name no shared skill has,
  with `.claude/skills` linked to `.agents/skills` again so Claude Code sees it.
- **A hook change** is a change to the script. Adding or removing a project hook touches both
  wiring files, which carry the same events and matchers (Codex accepts `Write|Edit` for
  its `apply_patch` tool). The scripts read either payload: Claude Code's
  `tool_input.file_path` or a Codex patch in `tool_input.command`, and
  `$CLAUDE_PROJECT_DIR` or, when Codex leaves it unset, the checkout the hook runs in.
- **Codex reads `.codex/` from the main checkout, even in a worktree** (verified on
  codex-cli 0.159): a T3 worktree gets the project hooks only once they are on the branch the
  main checkout has out, while `AGENTS.md` comes from the worktree itself. The hook commands
  resolve `git rev-parse --show-toplevel`, so the scripts that run are the worktree's.
- **Codex's sandbox needs elevated permission for real Postgres**, since
  `TEST_DATABASE_URL` reaches it over TCP on `localhost:5433`. A persistent approval
  uses these scoped prefixes, never a broader one: `pnpm test:db:postgres`,
  `pnpm db:test:reset`, and `docker compose up -d postgres` when the container must be
  started. The test database is still the only one those commands touch.
- **Codex runs a project hook only once it is trusted**: the project must be trusted, and
  each hook reviewed and approved when Codex first offers it.
- **Harness-only files stay where they are**: the permission allowlist in
  `.claude/settings.json` and the dev-server launcher in `.claude/launch.json` have no
  Codex counterpart here.

## Session hooks

Hooks are configuration, not a terminal feature, so they run in a headless session too. The
shared ones are wired at user level by the shared `install.sh`; the rest from this repo's two
wiring files.

- **`SessionStart`** (shared): `check-tool-path.sh` warns when the session's shell cannot find
  a tool the work needs; this repo adds `node`, `pnpm` and `playwright-cli` in
  `.agents/required-tools`. The fix is [the agent shell's PATH](#the-agent-shells-path).
- **`PreToolUse` on Bash**: `block-npx-tsc.sh` blocks `npx tsc`, `pnpm exec tsc` and
  `pnpm dlx tsc`, because `pnpm typecheck` generates the React Router route types first. The
  shared `block-pkill-f.sh` blocks `pkill -f`, whose pattern matches the shell running it and
  kills the agent's own Bash call (exit 144); the dev server stops with `pnpm dev:stop`.
- **`PostToolUse` on `Write|Edit`**: `format-edited-file.sh` runs Prettier over each
  file the tool just wrote, silently, so `pnpm format` is not a session's to remember.
- **`Stop`**: `stop-typecheck-lint.sh` runs `pnpm typecheck && pnpm lint` (~11.6 s) and
  **blocks** with exit 2, putting the failing output in front of the agent. It is the
  backstop, not the plan: it reports once at the end, knowing nothing of what you
  touched. It reads the uncommitted working tree only, and skips a turn that changed
  nothing either half reads; the script's header says what that is, and why.

`SKIP_STOP_CHECKS` set to any value is the local bypass (`SKIP_STOP_CHECKS=1 claude`, or
`codex`, or exported for the session). The gate keeps blocking while the failure persists;
Claude Code force-closes the turn after 8 consecutive blocks, so the wording of the last
instruction is all `stop_hook_active` decides.

## The agent shell's PATH

T3 Code, and the Claude Code and Codex sessions it starts, inherit PATH from the desktop
login session. That session reads `~/.profile`, not `~/.bashrc`, so a tool directory added
only in `~/.bashrc` is on PATH in a terminal and missing in an agent's shell. This machine
needs two directories there: fnm's default Node (`~/.local/share/fnm/aliases/default/bin`,
which holds `node` and `pnpm`) and pnpm's global bin (`$PNPM_HOME/bin`, which holds
`playwright-cli` and `codex`). Both lines live in `~/.profile`; a change there takes
effect at the next login, not in a running T3 Code.

When the `SessionStart` warning fires, or `pnpm dev:info` shows a tool `MISSING`, the fix
is that profile line, made by the user. A session does not prefix its commands with
`export PATH=…`: that hides the cause from the next session, which then pays for it again.

## Delegating to subagents

A subagent costs a full orientation and returns only its summary, so delegate
by the size of the read, not the size of the task:

- Reading one to three files to decide or verify something is inline work.
- Understanding that needs four or more files is one narrow mapping subagent,
  which returns the conclusion, not the file dumps.
- Bulk output (a long diff, a log, a rendered page) is read by a subagent when
  only its conclusion is needed in the main thread.
- Bash for state (`git`, `gh`) stays inline.

Brief a subagent with the exact paths and skill files to read, never a digest
of them, and ask for its report as text with a fixed shape: status, one-line
summary, artifacts touched, next step, risks. A subagent whose last action is a
tool call returns the tool result instead of its report.

Reading outside the repo goes to the shared `research` agent, in the Research role of the
shared `agents/models.md`, which also says how each harness reaches it; the sources it prefers
for this stack are [research.md](research.md).
