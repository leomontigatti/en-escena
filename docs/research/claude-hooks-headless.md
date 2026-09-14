# Claude Code hooks in the AFK headless runners

Research for issue #930 (map #929). Question: do `.claude/settings.json` hooks
(`PostToolUse` on `Write|Edit`, `Stop` running `pnpm typecheck && pnpm lint`)
fire in the AFK runners' headless `claude -p` invocations, and how do
`PostToolUse`/`Stop`/`SubagentStop` behave there.

## 1. How the AFK runners actually invoke the CLI

The runners (`.sandcastle/agent-implement/implement.mts` etc.) don't shell out
to `claude` themselves — they call `@ai-hero/sandcastle`'s `run()` with
`createAgent()` (`.sandcastle/lib/runner.mts`), which wraps
`sandcastle.claudeCode(AGENT_MODEL, { effort: AGENT_EFFORT })`. The sandbox is
`noSandbox()`: no Docker, the agent runs directly on the GHA runner host in the
already-checked-out worktree.

`@ai-hero/sandcastle`'s `claudeCode` provider builds the actual command
(source: `src/AgentProvider.ts`,
https://raw.githubusercontent.com/mattpocock/sandcastle/main/src/AgentProvider.ts,
version pinned by `package.json` is `^0.12.0` — main branch was the closest
available source, **could not verify** it's byte-identical to 0.12.0):

```
claude --print --verbose[--permission-mode <mode> | --dangerously-skip-permissions]
  --output-format stream-json --model <model> [--effort <level>]
  [--resume <id>] [--fork-session] -p -
```

Facts:
- No `--settings`, `--setting-sources`, `--bare`, `--safe-mode`, or `--restricted`
  flag is ever passed. `.github/workflows/agent-implement.yml` (and the sibling
  `agent-*.yml` workflows) also pass none of these — the only CLI-relevant step
  is `npm install -g @anthropic-ai/claude-code` before `pnpm exec tsx
  .sandcastle/agent-implement/implement.mts` runs.
- AFK runs use `--dangerously-skip-permissions` (no `permissionMode` option is
  set anywhere in `.sandcastle/lib/runner.mts`), so permission prompts are
  bypassed but hook loading is a separate mechanism (see §2).
- The runner's own `AGENT_BUDGET_MINUTES` abort (`createBudget()` in
  `runner.mts`) is an `AbortSignal` sandcastle wires into `run()`; it is not a
  CLI flag and doesn't change hook behaviour, it just aborts/kills the process
  tree when the wall clock runs out.

## 2. Do project `.claude/settings.json` hooks load under `-p`?

**Yes, by default — nothing the runners pass disables them.**

From the Claude Code headless docs
(https://docs.claude.com/en/docs/claude-code/headless):

> "Without `--bare`, a `-p` session runs the hooks in a project's
> `.claude/settings.json` and connects the servers in its `.mcp.json`, even in
> a folder you've never trusted. A `-p` session shows no workspace trust
> dialog and no per-server approval prompt."

The only flags that would suppress project hooks are `--bare` (skips
auto-discovery of hooks/skills/commands/subagents/plugins/MCP/CLAUDE.md
entirely), `--safe-mode` (disables all customizations, including hooks, to
debug a broken config), `--restricted` (loads only managed settings +
`--settings`), or an explicit `--setting-sources` that omits `project`
(CLI reference: `--setting-sources` — "Comma-separated list of setting
sources to load (`user`, `project`, `local`)",
https://docs.claude.com/en/docs/claude-code/cli-reference). None of these
appear in the runner command or the workflow YAML, so the runners load
`user`, `project`, and `local` settings the same as an interactive session
would — i.e. the repo's `.claude/settings.json` hooks (already present:
a `PreToolUse` hook on `Bash` in `block-npx-tsc.sh`) are already running in
every AFK job today, and a new `PostToolUse`/`Stop` hook added to that file
would run there too.

Caveat found in the docs but not exercised by these runners: `noSandbox()`
runs on the GHA host, not a "cloud session"/self-hosted environment, so the
"Cloud sessions on Claude Code on the web don't read your local
`~/.claude/settings.json`" carve-out
(https://docs.claude.com/en/docs/claude-code/hooks#hook-locations) doesn't
apply — it's an ordinary `-p` invocation in a real checkout.

## 3. `PostToolUse` on `Edit|Write`

Source: https://docs.claude.com/en/docs/claude-code/hooks#posttooluse and
`#matcher-patterns`.

- **Fires**: "immediately after a tool completes successfully." It does not
  fire for failed tool calls (there's a separate `PostToolUseFailure` event
  for that) and does not fire for a file rewritten by `Bash` or a process
  outside Claude Code — only for the tool call itself.
- **Matcher syntax**: `"Edit|Write"` (letters/`|` only) is evaluated as an
  **exact-string alternation**, not a regex — it matches the tool names
  `Edit` and `Write` exactly, nothing else. The docs explicitly warn matchers
  containing only letters/digits/`_`/`-`/spaces/`,`/`|` take the exact-match
  path; anything else (e.g. a bare `.` or `^`) falls onto the regex path,
  where `RegExp.prototype.test` is unanchored (`Edit.*` would match both
  `Edit` and `NotebookEdit`).
- **Does `NotebookEdit` need listing separately?** Yes. The doc's own matcher
  example states: "`Edit.*` matches both `Edit` and `NotebookEdit`" —
  implying the exact string `Edit` (as used in `Edit|Write`) does **not**
  match `NotebookEdit`. If Prettier should also run after notebook edits,
  the matcher needs `Edit|Write|NotebookEdit`.
- **`MultiEdit`**: current tool-reference docs (both the `PreToolUse` tool
  list in the hooks reference and the CLI's `--restricted`/`--bare` tool
  descriptions) no longer name a `MultiEdit` tool at all — only `Edit` (which
  now has a `replace_all` field) is listed. **Could not verify** from primary
  sources whether `MultiEdit` still exists as a distinct tool name on some
  installed CLI version; if a runner's pinned `@anthropic-ai/claude-code`
  version still ships it, it would need listing too, since it's a different
  exact tool name from `Edit`.
- **What stdin carries**: `PostToolUse` input includes `tool_name`,
  `tool_input` (the arguments — for `Write`/`Edit`, `tool_input.file_path`,
  always an absolute, platform-native path), and `tool_response` (the tool's
  result). Example for a `Write` call:
  ```json
  {
    "hook_event_name": "PostToolUse",
    "tool_name": "Write",
    "tool_input": { "file_path": "/path/to/file.txt", "content": "..." },
    "tool_response": { "filePath": "/path/to/file.txt", "type": "create" },
    "tool_use_id": "toolu_...",
    "duration_ms": 12
  }
  ```
  So a Prettier hook reads `tool_input.file_path` (present for both `Write`
  and `Edit`) to know which file to format.
- **Exit code 2 on `PostToolUse` does not block** — the tool already ran.
  Per the "Exit code 2 behavior per event" table: `PostToolUse` → "Can block?
  No — Shows stderr to Claude; the tool already ran." So a Prettier hook that
  exits 2 can only surface a message to Claude, not undo/prevent the edit;
  formatting-in-place (rewrite the file, exit 0) is the only way to make it
  authoritative.

## 4. `Stop` hook (`pnpm typecheck && pnpm lint`, exit 2 to block)

Source: https://docs.claude.com/en/docs/claude-code/hooks#stop and
`#exit-code-2-behavior-per-event`.

- **Fires**: "when the main Claude Code agent has finished responding."
  Explicitly does **not** run on a user interrupt, and API errors route to
  `StopFailure` instead of `Stop`.
- **Fires under `-p`**: the docs don't carve out headless mode for `Stop`
  (unlike some other events); combined with §2's confirmation that `-p`
  loads project hooks generally, `Stop` fires at the end of each turn in a
  headless run the same as interactively. **Could not verify** with a
  first-party statement naming `-p` explicitly for `Stop` (no doc sentence
  says "`Stop` fires in `-p` mode"), but no doc statement excludes it either,
  and the general headless-hooks statement in §2 covers all hook events, not
  just some.
- **Exit 2 blocks**: "`Stop` → Can block? Yes — Prevents Claude from
  stopping, continues the conversation." The blocking reason is either the
  hook's JSON `reason` field (when it also returns `"decision": "block"`) or,
  for a bare `exit 2` with plain stderr, the stderr text itself: "A hook that
  blocks by exiting 2 routes the same way as `reason`: Claude receives the
  stderr message as the explanation for why it should continue." So `pnpm
  typecheck && pnpm lint` failing (piping its output to stderr, exit 2) feeds
  the failure output back to Claude as the reason to keep working — matching
  the ticket's intent.
- **`stop_hook_active`**: `Stop` input carries `stop_hook_active` (boolean,
  `session_id`, `transcript_path`, `cwd`, `permission_mode`, plus
  `last_assistant_message`, `background_tasks`, `session_crons`).
  `stop_hook_active` is `true` "when Claude Code is already continuing as a
  result of a stop hook" — a hook should check this (or otherwise avoid
  re-blocking on a condition that can't resolve) to avoid an infinite loop.
  Claude Code also has its own hard backstop: "Claude Code overrides the
  hook and ends the turn after **8 consecutive blocks**" — so even a
  misbehaving/always-failing typecheck hook can't loop forever; after the
  8th consecutive block Claude Code forces the turn to end regardless of the
  hook's exit code.
- **What the runner sees when it blocks**: within one `claude -p`
  invocation, a `Stop` block doesn't end the process — Claude just keeps
  working inside the same turn/session (more tool calls, one more model
  response), and the CLI process only exits once a turn is allowed to end
  (either the hook stops blocking, or the 8-block cap forces it). The AFK
  runner command has **no `--max-turns` flag** (not present anywhere in
  `AgentProvider.ts`'s `claudeCode` provider or in the `.sandcastle`
  runners), so there's no separate CLI-level turn ceiling interacting with
  this — the only ceiling is sandcastle's own `maxIterations` (a
  runner-level iteration count across whole `claude -p` invocations, e.g.
  `MAX_ITERATIONS = 100` in `implement.mts`) and the `Stop` hook's own
  8-consecutive-block cap inside a single invocation. **Could not verify**
  the exact process exit code the CLI reports after being forced to end a
  turn at the 8-block cap (no doc names a distinct exit code for that case;
  it reads as an ordinary successful turn completion, exit 0, from the
  process's point of view — sandcastle's `parseStreamLine`/`result` event
  parsing would need to distinguish "genuinely done" from "forced to stop
  still failing typecheck" itself, e.g. by checking the final assistant
  message or running `pnpm typecheck` again after the fact).

## 5. `SubagentStop` and the `research` subagent

There is no separate `.sandcastle` runner for "research" — `research` is a
Claude Code **subagent** defined at `.claude/agents/research.md`
(`disallowedTools: Agent`, `maxTurns: 45`), invoked via the built-in `Agent`
tool with `subagent_type: "research"` from inside whatever Claude Code
session calls it (an interactive session, or, if an AFK runner's prompt ever
instructs it to delegate research, a headless `-p` session).

- `SubagentStop` (https://docs.claude.com/en/docs/claude-code/hooks#subagentstop)
  "Runs when a Claude Code subagent has finished responding," matched by
  `agent_type` (same matcher values as `SubagentStart`, e.g. `"research"`).
  It is a **distinct event from `Stop`** — the top-level `Stop` hook does
  **not** fire when a subagent finishes, only when the main conversation's
  turn ends. So a `Stop` hook gating `pnpm typecheck && pnpm lint` on the
  main AFK session does **not**, by itself, gate anything the `research`
  subagent does — the subagent can finish (and its `Agent` tool call return
  to the parent) without ever tripping the parent's `Stop` hook; the parent's
  `Stop` hook only fires once the parent's own turn ends afterward.
  `PostToolUse` on the `Agent` tool is the documented way to react to a
  subagent's result in the parent, if that's wanted instead.
- Exit 2 on `SubagentStop` blocks the same way as `Stop` — "Prevents the
  subagent from stopping" — and uses the same decision-control shape
  (`decision: "block"` + `reason`, or `hookSpecificOutput.additionalContext`)
  and the same `stop_hook_active` field.
- Since this research runner is invoked with `disallowedTools: Agent`, it
  cannot itself spawn nested subagents, so any `SubagentStop` hook matching
  `research` fires once per research task, not recursively.
- Relevance to the decision ticket: if `pnpm typecheck && pnpm lint` should
  also gate research-only runs (which touch only `docs/research/**.md` and
  shouldn't need a typecheck), that would be a separate, explicit
  `SubagentStop` hook (matcher `research` or narrower) — the ticket's `Stop`
  hook on the main session doesn't reach it.

## Settings JSON shape for the decision ticket

Combining §3 and §4 (the two hooks the local-loop ticket wants), the literal
`.claude/settings.json` shape is:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/prettier-file.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/typecheck-and-lint.sh"
          }
        ]
      }
    ]
  }
}
```

(`Stop` has no matcher support — per the matcher-patterns table, `Stop` is one
of the events that "always fires on every occurrence.") The `prettier-file.sh`
script reads `tool_input.file_path` from stdin JSON to know which file to
format; `typecheck-and-lint.sh` runs `pnpm typecheck && pnpm lint`, and on
failure must print the failure output to **stderr** and `exit 2` (JSON
`{"decision":"block","reason":"..."}` on stdout works too, and is what
carries the message when both are present) — plain `exit 1` from either hook
does **not** block anything under the standard decision model.

## What could not be verified

- Whether `@ai-hero/sandcastle@0.12.0` (the exact version pinned in
  `package.json`) builds an identical `claude` command to the `main` branch
  source read here — only `main` was fetched from GitHub; the installed
  version wasn't present in `node_modules` in this checkout to diff directly.
- Whether the currently-installed `@anthropic-ai/claude-code` (installed
  fresh via `npm install -g @anthropic-ai/claude-code` in the workflow, i.e.
  whatever is latest at run time) still exposes a `MultiEdit` tool distinct
  from `Edit` — current docs list only `Edit`/`NotebookEdit` by name.
- The literal process exit code `claude -p` returns when a `Stop` hook's
  8-consecutive-block cap forces a turn to end while the hook is still
  failing (no doc names a distinct code for that case).
- An explicit doc sentence naming `-p` for the `Stop` event specifically
  (inferred from the general "`-p` loads project hooks" statement, which
  doesn't itself enumerate event types).

## Sources

- https://docs.claude.com/en/docs/claude-code/hooks (hooks reference:
  locations, matcher patterns, exit codes, `PostToolUse`, `Stop`,
  `SubagentStop`, `StopFailure`)
- https://docs.claude.com/en/docs/claude-code/headless (headless `-p`
  behaviour, `--bare`, hook loading under `-p`)
- https://docs.claude.com/en/docs/claude-code/cli-reference (`--setting-sources`,
  `--settings`, `--bare`, `--safe-mode`, `--restricted`, `--max-turns`)
- https://docs.claude.com/en/docs/claude-code/settings (settings file
  locations/precedence)
- https://raw.githubusercontent.com/mattpocock/sandcastle/main/src/AgentProvider.ts
  (`claudeCode` provider — the exact `claude` command sandcastle builds)
- `.sandcastle/agent-implement/implement.mts`, `.sandcastle/lib/runner.mts`,
  `.github/workflows/agent-implement.yml`, `.claude/settings.json`,
  `.claude/agents/research.md` (this repo)
