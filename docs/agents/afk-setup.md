# AFK — operational setup (labels, secrets, degradation)

> **Scope since ADR-0016 (2026-09-25).** The implement, review, write-PR and To Issues
> runners are retired; implementation, review and PRD slicing happen in local sessions. What
> this document sets up is the three workflows that remain: Update Branch, Promote Queued and
> Architecture Review. Paragraphs that describe the retired runners are marked or removed.

Runbook for the infrastructure consumed by **all** the AFK workflows (Part 3 of the
[spec](./afk-agent-platform-spec.md)). Spec §3.1 is the **source of truth** for _what_ is
needed; this doc is the _how_ for this repo and the record of what is already provisioned.
Originating issue: [#343](https://github.com/leomontigatti/en-escena/issues/343).

> **Status:** labels **created** (2026-07-18). Secrets **documented** here; **loading** them is
> a human action (see the checklist) because the values are credentials this runbook cannot
> generate. The **empirical test of degradation without a PAT** runs with the first chaining
> workflow (#344+), not before: until a workflow exists that adds a label-trigger, there is
> nothing to degrade. See [Degradation without a PAT](#degradation-without-a-pat).

## `agent:*` + `source:*` labels

The state machine (§3.2) assumes these labels exist. They are listed, with colour and
description, in the `agent` and `provenance` groups of
[`.github/labels.json`](../../.github/labels.json), and `pnpm labels:sync` creates or updates
them in the repo ([#1116](https://github.com/leomontigatti/en-escena/issues/1116); it never
deletes). The canonical meaning of each: spec §3.1 → "Labels (pre-create all of these)".
`pnpm check:labels` fails CI when a workflow or a Sandcastle runner names a label the file does
not hold, which is how a typo in an `--add-label` is caught before the run that needs it.

> For `source:architecture-review` the spec says the Architecture Review workflow creates it
> on-demand if missing; we pre-create it anyway so provenance is consistent from day zero.

## Dispatch: from `ready-for-agent` (triage) to the `agent:*` trigger

The AFK workflows **trigger on the `agent:*` labels above**, never on the `ready-for-agent`
triage label (see [triage-labels.md](triage-labels.md)). `ready-for-agent` means "specified and
grabbable" — it is a **triage state, not a trigger**: an issue/PRD with `ready-for-agent` and no
`agent:*` label **does nothing**.

Dispatch is **deliberately human** (it fits the PR-only + human-merge model of map #319): you
decide _when_ each item runs by adding the label by hand after publishing it.

- **PRD → sub-issues**: a local session runs `/to-tickets` on the PRD
  ([workflows.md](./workflows.md#issue-breakdown-workflow)). Nothing fires.
- **Single issue → implementation**: label it `ready-for-agent`; a local session grabs it
  (ADR-0016). Nothing fires.
- **Blocked item** you want to queue: put **`agent:queued`**; it auto-promotes to
  `ready-for-agent` when its declared blockers close (native deps).

### The one trigger you never apply: `agent:update-branch` ([#1020](https://github.com/leomontigatti/en-escena/issues/1020))

Branch protection requires an up-to-date branch, so every open PR is behind the moment the one
below it merges. `.github/workflows/agent-label-behind-prs.yml` runs on **`push` to `master`**
and applies `agent:update-branch` to each of them; `agent-update-branch` then does the merge
exactly as it does for a label you applied by hand (spec §4.6). Nothing to dispatch, and
nothing to wait on — the driving session neither runs `gh pr update-branch` nor labels.

What it deliberately leaves alone:

- A PR on a `renovate/*` or `dependabot/*` branch: the bot rebases its own.
- A PR whose base is **not** `master` — one stacked on another branch. This is the
  intended behaviour, not a gap: such a PR is behind _its own_ base, not behind `master`, and
  merging `master` into it would be wrong. The cost is that a stacked chain is picked up one link
  at a time, as each link merges and the next PR's base flips to `master`.
- A PR carrying **`agent:in-progress`**: a run holds its lock (spec §3.5) and its own push is
  what settles the branch. If it is still behind afterwards, the next push to `master` labels it.
- A PR already carrying **`agent:update-branch`**: the previous pass labelled it and the run has
  not started; re-adding triggers nothing.
- A PR whose `mergeStateStatus` never resolved. GitHub computes it in a background job that the
  query itself kicks off, so for the first seconds after a push every PR answers `UNKNOWN`. The
  workflow re-asks (ten times, six seconds apart) and then gives up **without failing** — an
  unresolved PR costs only itself, and the next push asks again.

Without `AGENT_PAT` this degrades the usual way (see [Degradation without a PAT](#degradation-without-a-pat)):
the label lands, `agent-update-branch` does not start on its own, and re-adding it by hand resumes.

### With the `to-spec` / `to-tickets` skills

These are Matt Pocock's HITL skills, vendored in `.agents/skills/` and run in a session, not in
GHA. They label what they publish `ready-for-agent`, which here is the triage label a session
grabs from, so there is no `agent:*` label to add afterwards. The repo's deltas on top of them
are in [workflows.md](./workflows.md#prd-workflow).

## Secrets

Three credentials; the full matrix (what each is / why) is in spec §3.1 → "Secrets".
Operational summary for this repo:

| Secret                    | How to obtain it                                                                                                                                                                | How to load it                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `GITHUB_TOKEN`            | **Built-in.** GitHub Actions injects it per-run. Nothing to do.                                                                                                                 | —                                       |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` (Claude Code CLI, on an account whose plan enables CI usage). Generates a long-lived OAuth token.                                                          | `gh secret set CLAUDE_CODE_OAUTH_TOKEN` |
| `AGENT_PAT`               | A **classic** PAT with `repo` + `workflow` scopes; or fine-grained with Contents / Issues / Pull requests = Read+Write and Workflows = Read+Write. From a human or bot account. | `gh secret set AGENT_PAT`               |

### Why `AGENT_PAT` (strongly recommended)

Without it the platform **works but degrades** (see below). It is needed for two reasons
(spec §3.1/§3.4):

1. **Chaining.** GitHub **suppresses** workflow triggers for events caused by `GITHUB_TOKEN`
   (anti-loop). An `--add-label agent:update-branch` done with `GITHUB_TOKEN` leaves the label
   but **does not fire** the Update Branch workflow. The PAT does fire it.
2. **Pushing to `.github/workflows/`.** Pushing changes to workflow files requires the
   `workflow` scope, which `GITHUB_TOKEN` does not have.

### Loading checklist (human action)

This runbook cannot generate credentials, but it can guide loading them. The helper
[`scripts/setup-github-secrets.sh`](../../scripts/setup-github-secrets.sh) is idempotent
(it asks before overwriting), takes hidden input and verifies at the end:

```bash
# 1. Generate the runner token (prints a long-lived OAuth token)
claude setup-token

# 2. Run the helper: asks for CLAUDE_CODE_OAUTH_TOKEN and AGENT_PAT, loads and verifies them
pnpm setup:secrets
```

The orchestration PAT is generated separately, at https://github.com/settings/tokens (classic:
`repo` + `workflow` scopes), before running the helper. By hand, without the script, it is the
same thing it does internally: `gh secret set CLAUDE_CODE_OAUTH_TOKEN`, `gh secret set
AGENT_PAT`, `gh secret list`.

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
>
> That is why our second secret is `AGENT_PAT` (`repo` + `workflow`) — used by the
> **orchestrator** to chain and to push to `.github/workflows/`, not by the agent. From Matt's
> script we took the **ergonomics** (idempotency, hidden input, verification), not the secrets
> model. If the agent ever needed ad-hoc reads, the correct escalation would be a
> **fine-grained, read-only, single-repo** token, not the broad classic `repo` one.

If `AGENT_PAT` is omitted: the platform keeps going, degraded. See the next section.

### Fork PRs never reach the runner ([#635](https://github.com/leomontigatti/en-escena/issues/635))

> Written for three workflows-over-a-PR. Since ADR-0016 only Update Branch runs on
> `pull_request_target`; Review and Implement PR below are historical, the guard is not.

The token-free-agent rule above bounds _prompt injection_ — text the agent reads. It says
nothing about code executing in the job, upstream of the agent. The three workflows-over-a-PR
(`agent-review`, `agent-implement-pr`, `agent-update-branch`) run on `pull_request_target`,
which evaluates the workflow from the base branch but runs with this repo's secrets, and each
checks out `pull_request.head.sha`. On a fork PR that would put contributor-controlled code on
disk inside a job that holds `AGENT_PAT`, then feed it to `pnpm install` lifecycle scripts and
to the runner script itself. (Until #956 the checkout also persisted that PAT into
`.git/config`; see [Where the PAT is during a run](#where-the-pat-is-during-a-run).)

So each of those three jobs carries a provenance condition alongside its label check:

```yaml
if: >-
  github.event.label.name == 'agent:review' &&
  github.event.pull_request.head.repo.full_name == github.repository
```

It sits at job level because that is the only form that keeps the untrusted tree from ever
being checked out; a step-level refusal would run after the checkout it is meant to prevent.
The trade-off is a silent skip — a job-level `if:` cannot comment on the PR. Nothing working is
lost: the runners push to `origin`, which is this repo, while a fork PR's branch lives on the
fork, so fork PRs never worked here anyway.

`tests/afk/pr-workflow-fork-guard.test.ts` holds the guard in place. It does not read a list of
workflows to check — it scans `.github/workflows/` for the exposed _shape_ (a
`pull_request_target` trigger plus a checkout of a `pull_request.head.*` ref) and requires every
job of every match to carry the condition. A fourth PR-level workflow therefore fails the suite
until it is guarded, rather than going uncovered because nobody extended a table.

Do not "fix" any of this by switching to `pull_request`: `pull_request_target` is deliberate
(spec §3.3) — the labeled event must fire even when the PR is out-of-date or conflicting, which
is exactly when `agent:update-branch` is needed.

## Where the PAT is during a run ([#956](https://github.com/leomontigatti/en-escena/issues/956))

> Written when the implement runners chained and pushed. Since ADR-0016 the only run that
> pushes with the PAT is Update Branch, and Promote Queued no longer runs
> `scripts/afk-add-label.sh`; the mentions of Implement, Implement PRD and Review below are
> historical, the rule for any step that follows an agent session is not.

The agent never holds a GitHub credential (spec §3, and `revokeGitHubToken()` for the runners
that prefetch). That rule used to have a hole below the environment: every `actions/checkout`
in the agent workflows took `token: ${{ secrets.AGENT_PAT || github.token }}` and, by default,
persisted it into `.git/config` as an `http.https://github.com/.extraheader`, so a session that
ran `git config --get-all http.https://github.com/.extraheader` — or a `pnpm install` lifecycle
script — could read a `repo`+`workflow` PAT. The push at the end of the job was what needed it.

Now the credential exists in exactly one place per push:

- **Every checkout** in `.github/workflows/` sets `persist-credentials: false`. The repo is
  public, so the fetches the jobs do afterwards (`git fetch origin master:master`, the
  resume fetch in `agent-implement-prd`, the base fetch inside the update-branch runner) need
  no token at all.
- **The "Configure git identity" step**, which runs right before every agent session, fails the
  job if an `extraheader` is nonetheless present in `.git/config`. That is the acceptance
  criterion of #956 turned into a step, so a future checkout that forgets the flag is caught
  by the run itself rather than by someone reading YAML.
- **Every push step** (the final push, the bank-on-failure push, and the race-safe pushes of
  the three PR workflows) authenticates per command, with
  `PUSH_TOKEN: ${{ secrets.AGENT_PAT || github.token }}` scoped to that step's `env:`:

  ```bash
  auth=$(printf 'x-access-token:%s' "$PUSH_TOKEN" | base64 -w0)
  echo "::add-mask::$auth"
  git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" push …
  ```

  `actions/checkout` masks the header it builds; this one is ours to mask, because nothing
  else registers it as a secret. A push that fails for anything other than a lost lease fails
  its step, rather than exiting 0 with nothing pushed — only the race patterns were matched
  before, and an unpushed branch is the one outcome an AFK run cannot report on itself.
  Nothing is written to any git config, so the agent that runs _after_ a push
  (`write-pr` in `agent-implement`, `write-prd-pr` in `agent-implement-prd`) inherits nothing
  either. The PAT-first order is what lets a branch that touches `.github/workflows/**` be
  pushed; the `github.token` fallback keeps the no-PAT degradation contract above.

- **Every step after an agent session that carries the PAT runs a pre-session snapshot**, never
  a path in the work tree. The session has write access to the tree and the job sits on an
  unreviewed `agent/` branch, so `scripts/afk-add-label.sh` there is not necessarily the file
  that was reviewed by the time the chain hop at the end of the job needs it. The two workflows
  that chain after a session (`agent-implement`, `agent-implement-prd`) therefore copy the
  script to `$RUNNER_TEMP` right after `Checkout master` — before the branch is created or
  resumed — and record its `sha256sum` in a **step output**. The chaining step takes the digest
  in through `env:`, re-hashes the copy, fails with an `::error::` on a mismatch, and only then
  runs the copy. The digest is what does the work: an unsandboxed session can reach
  `$RUNNER_TEMP`, but it cannot write a step output. `tests/afk/checkout-credentials.test.ts`
  holds the rule for every workflow that starts a `.sandcastle/**` runner, discovered by shape.

The `GITHUB_TOKEN` grants were audited against real use at the same time: `contents: write`
serves the `github.token` push fallback, `issues: write` the label and comment calls on issues,
`pull-requests: write` the label, comment, reply and review calls on PRs, and the two
`contents: read` workflows need no more than that (`architecture-review` only checks out; `ci`'s `actions-gate` also reads this repo through
`GH_TOKEN` for zizmor's online audits). No key was found without a use, so none was dropped.

`tests/afk/checkout-credentials.test.ts` holds the first bullet in place across every workflow
in the directory, listed or not; zizmor's `artipacked` audit in `actions-gate` is the second
line, and the suppression that #955 had to ship for it is gone.

## Per-workflow permissions matrix

**Recorded in spec §3.1** → "Per-workflow permissions matrix" (8 rows, columns `contents` /
`issues` / `pull-requests`). It is not duplicated here: each workflow (#344+) declares its
minimum `permissions:` from that table as it is implemented.

The one workflow outside that table is the local `agent-label-behind-prs` (#1020): it declares
`contents: read` for the checkout that puts `scripts/afk-add-label.sh` on disk, and
`pull-requests: write` for the label it adds. A declared `permissions:` block sets every scope
it omits to `none`, so omitting `contents:` there would 403 the checkout the label script needs.

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
| `agent-update-branch` | 30                     | 25                     |
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

**A completion after the budget counts.** Because of that gap, an agent can commit and emit
`<promise>COMPLETE</promise>` after the budget fired, and `run()` still rejects. Run
34715632348 lost #917 that way: finished and committed, reported as failed, never marked
implemented. `runMain` now treats a `BudgetExhaustedError` as success when the agent's stream
had already carried the completion signal **and** the working tree is clean. Runners opt in by
passing the context's `completion` watch to `streamingLog`. `implement` and `implement-prd` opt in
as is, because their whole result is their commits. `implement-pr` also needs its structured
output, which a rejected `run()` never returns: its extract pass does not run. So it catches the
late completion itself (`isLateCompletion`), counts its commits from `HEAD`, and reads its
output back from the last valid `<output>` block in the agent's own text, which the watch keeps.
With no valid block, the commits still land and a top-level note says the replies were not
recovered (#1186; run 35989696715 lost six green commits on #1185 before this).
`tests/afk/runner-budget.test.ts` and `tests/afk/implement-pr-late-completion.test.ts` cover the
rule.

**Why the implement passes get 60 / 50.** A slice that carries a migration, a repository,
screens and their tests outgrows 25 minutes: #917 committed in its 26th minute. The implement
and review prompts state the budget (`{{WALL_CLOCK_BUDGET}}`, from `describeBudget()`, so it
follows this table), and the implement prompts ask the agent to commit each green part as it goes, because the "Bank partial work"
step can only push commits — uncommitted work dies with the runner.

**The invariant: the budget must stay strictly below the step's `timeout-minutes`.** If it is
equal or larger, Actions wins the race and the guardrail buys nothing.
`tests/afk/failure-reason-fallback.test.ts` enforces this for every runner step, so retuning a
number means updating this table and keeping that test green.

Unset or unparseable, `AGENT_BUDGET_MINUTES` means **no budget** and the runner behaves exactly
as it did before — the variable is a guardrail, not a requirement. `SIGTERM`/`SIGINT` handlers
are a last resort for a badly configured budget.

**The agent log is the other half.** The runner writes `*.agent.log` into `OUTPUT_DIR`
(`runner.temp`, which dies with the runner), so each workflow uploads it as an artifact
(`if: always()`, 14 days retention). The `failure()` steps fall back to the log's last 30 lines
when there is no `failure_reason.txt`, which is what makes even a process-tree kill diagnosable.

## Degradation without a PAT

**Contract** (spec §3.4): with the PAT absent or failing, every chain hop that _should_ fire the
next workflow **still lands the label** — the _state_ ends up correct — but the downstream
**does not start on its own**. A human re-adding the same label (an action external to
`GITHUB_TOKEN`) resumes the chain. The canonical bash pattern (try with `AGENT_PAT`, fall back
to `GITHUB_TOKEN` if absent or failing) is in §3.4 and **must** be implemented at every point
where a workflow adds a label to trigger another.

**One implementation of it ships: `scripts/afk-add-label.sh`** (#1029). It shipped inline in
four workflows until then, and one copy was fixed while the others kept swallowing the same
refusal (#1026, #1027) — so a new chain hop calls the script rather than pasting the block, and
the workflow needs an `actions/checkout` for it to be on disk. When the workflow also runs an
agent, the hop calls it **from the pre-session snapshot**, not from the tree: see
[Where the PAT is during a run](#where-the-pat-is-during-a-run). The script's header says why the
PAT goes first, why both exit statuses are read and why it posts to the REST labels endpoint
instead of `gh {issue,pr} edit`; `tests/afk/add-label.test.ts` runs the shipped bash. Callers
own the wording of success and decide what a refusal costs — the loop-shaped ones (Promote
Queued, Label Behind PRs) accumulate and carry on, so one stranded item costs only itself.

It is a script and not a composite action because of those loop-shaped callers: a composite
action is a _step_, and a step cannot be invoked once per item from inside a `run:` loop, so
Promote Queued and Label Behind PRs would have kept an inline copy each. Both shapes need the
checkout, so the action saved nothing there; and a single file is what lets the test harness
execute the shipped bash directly and the agent workflows snapshot and digest it.

### How it is tested (with the first chaining workflow, #344+)

There is no chaining workflow yet, so there is no degradation to exercise. Once the first one
exists (e.g. Label Behind PRs → Update Branch), the verification is:

1. With the repo **without** `AGENT_PAT` loaded, trigger the step that adds the label-trigger.
2. Confirm the label **appears** on the issue/PR (correct state).
3. Confirm the downstream workflow **did not** run (`gh run list` with no new run).
4. Re-add the label by hand and confirm it **does** trigger now.

The platform fact underpinning all of this — "label adds via `GITHUB_TOKEN` do not trigger
workflows" — is documented GitHub Actions behavior, not something to demonstrate per-repo; the
test above validates that _our_ implementation honors the contract.
