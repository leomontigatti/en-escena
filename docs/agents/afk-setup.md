# AFK — operational setup (labels, secrets)

> **Scope since ADR-0016 (last amendment 2026-09-26).** The implement, review, write-PR, To
> Issues, Update Branch, Label Behind PRs and Promote Queued runners are all retired;
> implementation, review, PRD slicing and branch updates happen in local sessions (the last of
> those through the [`babysit-pr`](../../.claude/skills/babysit-pr/SKILL.md) skill). Architecture
> Review is the only AFK workflow left. What this document sets up is its infrastructure.

Runbook for the infrastructure Architecture Review consumes (spec §3.1 covers the retired
workflows too; only the parts still load-bearing here are kept). Spec §3.1 is the **source of
truth** for _what_ is needed; this doc is the _how_ for this repo and the record of what is
already provisioned. Originating issue: [#343](https://github.com/leomontigatti/en-escena/issues/343).

> **Status:** labels **created** (2026-07-18). Secrets **documented** here; **loading** them is
> a human action (see the checklist) because the values are credentials this runbook cannot
> generate.

## `source:*` labels

`source:architecture-review` is listed, with colour and description, in the `provenance` group of
[`.github/labels.json`](../../.github/labels.json), and `pnpm labels:sync` creates or updates it
in the repo ([#1116](https://github.com/leomontigatti/en-escena/issues/1116); it never deletes).
`pnpm check:labels` fails CI when a workflow or a Sandcastle runner names a label the file does
not hold, which is how a typo in an `--add-label` is caught before the run that needs it.

> The spec says the Architecture Review workflow creates `source:architecture-review` on-demand
> if missing; we pre-create it anyway so provenance is consistent from day zero.

## Secrets

The full matrix (what each is / why) is in spec §3.1 → "Secrets". Operational summary for this
repo:

| Secret                    | How to obtain it                                                                                                       | How to load it                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `GITHUB_TOKEN`            | **Built-in.** GitHub Actions injects it per-run. Nothing to do.                                                        | —                                       |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` (Claude Code CLI, on an account whose plan enables CI usage). Generates a long-lived OAuth token. | `gh secret set CLAUDE_CODE_OAUTH_TOKEN` |

`AGENT_PAT` had no user left once Update Branch, Label Behind PRs and Promote Queued retired
(ADR-0016, last amendment): Architecture Review only reads issues with the built-in
`GITHUB_TOKEN` and publishes with it too, so no orchestration PAT is loaded any more.
`scripts/setup-github-secrets.sh` now loads only `CLAUDE_CODE_OAUTH_TOKEN`.

Fork PRs never reaching a runner is no longer a concern of a running workflow — Architecture
Review is scheduled, not triggered by a PR — but the fork-guard test
[`tests/afk/pr-workflow-fork-guard.test.ts`](../../tests/afk/pr-workflow-fork-guard.test.ts) still
holds: it now asserts that no workflow in `.github/workflows/` checks out a PR head under
`pull_request_target`.

### Loading checklist (human action)

This runbook cannot generate credentials, but it can guide loading them. The helper
[`scripts/setup-github-secrets.sh`](../../scripts/setup-github-secrets.sh) is idempotent
(it asks before overwriting), takes hidden input and verifies at the end:

```bash
# 1. Generate the runner token (prints a long-lived OAuth token)
claude setup-token

# 2. Run the helper: asks for CLAUDE_CODE_OAUTH_TOKEN, loads and verifies it
pnpm setup:secrets
```

By hand, without the script, it is the same thing it does internally: `gh secret set
CLAUDE_CODE_OAUTH_TOKEN`, `gh secret list`.

> **Why there is no `GH_READ_TOKEN` (and why that _is_ sticking to Matt's model).** Matt's
> script in `course-video-manager` loads `CLAUDE_CODE_OAUTH_TOKEN` + `GH_READ_TOKEN` so the
> _agent_ can read issues with `gh issue view` _inside_ the runner. That can read as a
> divergence, but it is the opposite: `course-video-manager` is his **earlier, lightweight**
> project (RALPH); the **spec of this platform** (also Matt's, more evolved) sets as a
> **central rule** (spec §3, "central design rule") that _"the agent never holds a GitHub token
> and never calls the GitHub API to mutate state"_. We follow **that** rule: the orchestrator
> prefetches the context (e.g. the issue body, [#366]) and the runner carries no GitHub
> credential. Sticking to Matt = keeping it token-free.
>
> There is also a strong, independent security reason: the agent ingests third-party
> controllable text (issue bodies, PR comments), so an LLM + a GitHub credential = the blast
> radius of _prompt injection_. Note that Matt's `GH_READ_TOKEN` is a **classic PAT with the
> `repo` scope**, which is **not read-only** (it grants read _and_ write on all the owner's
> repos). Zero credentials in the agent is defense-in-depth.

## Per-workflow permissions matrix

**Recorded in spec §3.1** → "Per-workflow permissions matrix" (8 rows, columns `contents` /
`issues` / `pull-requests`). It is not duplicated here. Architecture Review's own declared block
is `contents: read` (the checkout) and `issues: write` (the PRD it publishes); it needs no
`pull-requests` scope since it never touches a PR.

## What a runner starts from ([#966](https://github.com/leomontigatti/en-escena/issues/966))

Three inputs used to drift from run to run. All three are pinned now.

**The Claude Code CLI.** Every workflow that runs an agent installs it the same way:

```sh
pnpm add -g --global-bin-dir "$PNPM_HOME" --allow-build=@anthropic-ai/claude-code @anthropic-ai/claude-code@stable
claude --version
```

`stable` rather than an exact version: the CLI ships almost daily, so a pin would be a bump
chore that gets skipped, while `stable` lags `latest` by weeks and moves on its own. The
`--allow-build` is not optional — without it pnpm reports a successful install but skips the
CLI's `postinstall`, and `claude` then fails mid-run with "native binary not installed". The
`claude --version` right after is what turns that into a loud install-time failure; it also
**logs the resolved version**, so the exact CLI a run used is in the `Install deps + agent
runner` step of that run's log.

`--global-bin-dir "$PNPM_HOME"` is not optional either, and not what you would guess:
`pnpm/action-setup` exports `PNPM_HOME` and puts **that** directory on `PATH`, but pnpm's
default global bin directory is `$PNPM_HOME/bin`, which is not on it. pnpm refuses a global
add whose bin directory is off `PATH`, so a bare `pnpm add -g` exits 1 on the runner with
`The configured global bin directory "…/bin" is not in PATH` before it installs anything.
Pointing the global bin directory at `$PNPM_HOME` itself is what puts `claude` on `PATH` for
the install step _and_ for the later runner step, which spawns a bare `claude`.

## Wall-clock guardrails: `timeout-minutes` + `AGENT_BUDGET_MINUTES`

Every runner step carries **two** ceilings, and the order between them is load-bearing:

| Workflow              | Step `timeout-minutes` | `AGENT_BUDGET_MINUTES` |
| --------------------- | ---------------------- | ---------------------- |
| `architecture-review` | 20 (spec §4.8)         | 15                     |

**Why both.** A step `timeout-minutes` expiry is the one failure mode that escapes the §3.7
reporting machinery: Actions kills the process tree, so `runMain`'s catch never runs, no
`failure_reason.txt` is written, and the orchestrator can only comment "(no reason file
written)". On #512 that cost an entire review with no diagnosis. `AGENT_BUDGET_MINUTES` builds
an `AbortSignal` that the runner passes to sandcastle's `run()`, which rejects with the abort
reason — turning the timeout back into an **ordinary throw** that the existing failure plumbing
reports normally.

**The abort does not stop the agent.** Under `noSandbox()` the agent is a bare child process
whose `exec` has no cancel path, so sandcastle's race against the abort only settles once the
agent exits on its own. The step's `timeout-minutes` is the only hard stop; the budget decides
how the run is _reported_, not when the agent stops. The gap between the two is where an agent
that was nearly done finishes anyway.

**The invariant: the budget must stay strictly below the step's `timeout-minutes`.** If it is
equal or larger, Actions wins the race and the guardrail buys nothing.
`tests/afk/failure-reason-fallback.test.ts` enforces this for every runner step, so retuning a
number means updating this table and keeping that test green.

Unset or unparseable, `AGENT_BUDGET_MINUTES` means **no budget** and the runner behaves exactly
as it did before — the variable is a guardrail, not a requirement. `SIGTERM`/`SIGINT` handlers
are a last resort for a badly configured budget.

**The agent log is the other half.** The runner writes `*.agent.log` into `OUTPUT_DIR`
(`runner.temp`, which dies with the runner), so the workflow uploads it as an artifact
(`if: always()`, 14 days retention). The `failure()` step falls back to the log's last 30 lines
when there is no `failure_reason.txt`, which is what makes even a process-tree kill diagnosable.
