# AFK: Architecture Review setup and runner contract

Architecture Review is the only AFK workflow left (ADR-0016 and its amendments): a weekly,
unattended pass that proposes one deepening opportunity as a PRD-shaped issue. This document is
everything it needs: the label, the secret, the permissions, the contract between the workflow and
its runner, and the guardrails. The platform spec it was built from, and the runners it described,
were deleted on 2026-10-11 (ADR-0016, amendment of that date); what is below is what still holds.

## Where it lives

| Piece                                                                                  | Role                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`architecture-review.yml`](../../.github/workflows/architecture-review.yml)           | The orchestrator: checkout, install, run the runner, publish the PRD, write the summary.    |
| [`architecture-review.mts`](../../.github/architecture-review/architecture-review.mts) | The runner's entry point: embeds the prior proposals in the prompt, runs two passes.        |
| [`prompt.md`](../../.github/architecture-review/prompt.md)                             | The agent's prompt, and the only file the runner reads from the tree.                       |
| [`agent.mts`](../../.github/architecture-review/agent.mts)                             | Spawns `claude --print --output-format stream-json`, with an allow-listed environment.      |
| [`tests/afk/`](../../tests/afk/)                                                       | The contract's tests: CLI install, checkout credentials, budget, failure reason, agent env. |

The agent itself reads, from the checkout: `GLOSSARY.md`, `docs/adr/`, `docs/agents/domain.md`,
`docs/agents/coding-standards.md`, and the `codebase-design` and `domain-modeling` skills.
Renaming or moving any of them means updating `prompt.md` in the same change.

## The runner contract

**Inputs in through environment variables, outputs out through files, and the orchestrator does
every GitHub mutation.**

- _Inputs:_ `GH_REPO`, `OUTPUT_DIR`, `AGENT_BUDGET_MINUTES`, `CLAUDE_CODE_OAUTH_TOKEN`, and
  `GH_TOKEN`, which the runner uses only for a read-only prefetch of the prior `source:architecture-review`
  proposals (open and closed) before it starts the agent.
- _Outputs, in `OUTPUT_DIR`:_ `architecture_review_output.json`, plus `prd_title.txt` and
  `prd_body.md` when it proposes; `failure_reason.txt` on failure; `*.agent.log` always. The JSON
  is a discriminated union on `status`:

  ```
  // proposed:
  { status: "proposed", title: string (1..256), body: string,
    oneLineSummary: string, candidatesConsidered: string[] (>=1) }
  // skipped (every fresh candidate is already covered):
  { status: "skipped", reason: string }
  ```

- _Two passes._ The produce pass runs the prompt with no output schema, so a bad emit cannot abort
  the work; the extract pass resumes the same session (`--resume`) with "emit `<output>` now,
  change nothing" and validates it against the zod schema (`structured-output.mts`), retrying with
  the validation error as feedback.
- _Read-only agent, single publisher._ The agent makes no commits and creates nothing; the
  workflow's publish step is the one path that opens the issue, labelled
  `source:architecture-review` and `needs-triage`. A human triages it, and a local session slices
  it with `to-tickets`.
- _No GitHub token in the agent._ The agent ingests text anyone can write (issue bodies), so an
  agent holding a credential is a prompt-injection blast radius. Its environment is an allow-list
  (`agentEnvironment` in `agent.mts`) with the agent credential and what the CLI needs to run;
  `tests/afk/runner-agent.test.ts` checks the environment a spawned agent actually sees.

Two local choices ride on the contract without changing it:

- **Weekly, not per weekday.** The spec's reference cron was `0 9 * * 1-5`; here it is `0 9 * * 1`
  (Mondays). Between 2026-07-20 and 2026-09-01 the workflow proposed 33 PRDs and 5 were resolved:
  the queue grew about five times faster than it drained, and the duplicate-avoidance rule pushes
  a faster cadence toward ever more marginal candidates.
- **Documentation drift.** The prompt asks the agent to list any contradiction between a
  current-state document and the code it happened to read under `### Documentation drift` in the
  PRD's Further Notes (or in `reason` on a skip). It is a trial of whether a docs-staleness pass
  would earn its own workflow; if the heading keeps coming back empty, drop the rule.

## `source:*` labels

`source:architecture-review` is listed, with colour and description, in the `provenance` group of
[`.github/labels.json`](../../.github/labels.json), and `pnpm labels:sync` creates or updates it
in the repo (it never deletes).
`pnpm check:labels` fails CI when a workflow or the Architecture Review runner names a label the file does
not hold, which is how a typo in an `--add-label` is caught before the run that needs it.

> The workflow's publish step also creates `source:architecture-review` if it is missing; it is
> pre-created anyway so provenance is consistent from day zero.

## Secrets

`CLAUDE_CODE_OAUTH_TOKEN` reaches the runner step only; `GITHUB_TOKEN` also publishes the PRD.

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

There is no `GH_READ_TOKEN` either: the runner prefetches what the agent needs to read, so the
agent holds no GitHub credential (see the runner contract above).

## Permissions

The workflow declares `contents: read` (the checkout) and `issues: write` (the PRD it publishes);
it needs no `pull-requests` scope since it never touches a PR. The checkout sets
`persist-credentials: false`, which `tests/afk/checkout-credentials.test.ts` holds.

## What a runner starts from

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
| `architecture-review` | 20                     | 15                     |

**Why both.** A step `timeout-minutes` expiry is the one failure mode that escapes the failure
reporting: Actions kills the process tree, so `runMain`'s catch never runs, no
`failure_reason.txt` is written, and the run summary could only say "(no reason file
written)". `AGENT_BUDGET_MINUTES` builds
an `AbortSignal` that the runner hands every agent turn: when it fires, the runner kills the
agent's process group (the `claude` process and the shell tools it started) and the turn
rejects with the abort reason — turning the timeout back into an **ordinary throw** that the
existing failure plumbing reports normally.

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
