# AFK — operational setup (labels, secrets, degradation)

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

The state machine (§3.2) assumes these 8 labels exist. They **have already been created** with
the commands below (idempotent-ish: `gh label create` fails if one already exists, with no
effect). The canonical meaning of each: spec §3.1 → "Labels (pre-create all of these)".

The label descriptions below are quoted verbatim from the 2026-07-18 run, so this block matches
the labels actually present in the repo.

```bash
gh label create "agent:to-issues"    --color 1d76db --description "AFK: PRD listo para descomponerse en sub-issues"
gh label create "agent:implement"    --color 0e8a16 --description "AFK: listo para una corrida de implement"
gh label create "agent:queued"       --color fbca04 --description "AFK: listo pero esperando blockers declarados; auto-promueve. Solo humano."
gh label create "agent:in-progress"  --color 0052cc --description "AFK: corrida activa (actúa como lock)"
gh label create "agent:review"       --color 5319e7 --description "AFK: PR listo para el workflow de review automatico"
gh label create "agent:blocked"      --color b60205 --description "AFK: corrida fallo o fue rechazada; necesita atencion humana antes de reintentar"
gh label create "agent:update-branch" --color d93f0b --description "AFK: el PR debe mergearse hacia arriba con su base"
gh label create "source:architecture-review" --color 5a5a5a --description "Procedencia: PRD propuesto por el workflow Architecture Review"
```

Verify with: `gh label list --limit 100 | grep -E 'agent:|source:architecture'`.

> For `source:architecture-review` the spec says the Architecture Review workflow creates it
> on-demand if missing; we pre-create it anyway so provenance is consistent from day zero.

## Dispatch: from `ready-for-agent` (triage) to the `agent:*` trigger

The AFK workflows **trigger on the `agent:*` labels above**, never on the `ready-for-agent`
triage label (see [triage-labels.md](triage-labels.md)). `ready-for-agent` means "specified and
grabbable" — it is a **triage state, not a trigger**: an issue/PRD with `ready-for-agent` and no
`agent:*` label **does nothing**.

Dispatch is **deliberately human** (it fits the PR-only + human-merge model of map #319): you
decide _when_ each item runs by adding the label by hand after publishing it.

- **PRD → sub-issues** (auto-split): put **`agent:to-issues`** on the PRD.
- **Single issue → implementation**: put **`agent:implement`** on the issue (standalone, no
  parent).
- **Blocked item** you want to queue: put **`agent:queued`**; it auto-promotes to implementable
  when its declared blockers close (native deps).

### With the `to-spec` / `to-tickets` skills

These are global HITL skills; they run in your session, not in GHA, and by default they label
what they publish as `ready-for-agent` (and `to-tickets` suggests working the frontier with
`/implement`, a local command **already retired** in #347). Under the human-gated model that is
correct: **let them publish with `ready-for-agent`, ask them not to use `/implement` when they
finish, and then you add the matching `agent:*` label** to dispatch. There is no need to adapt
the global skills.

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
   (anti-loop). An `--add-label agent:implement` done with `GITHUB_TOKEN` leaves the label but
   **does not fire** the Implement workflow. The PAT does fire it.
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

The token-free-agent rule above bounds _prompt injection_ — text the agent reads. It says
nothing about code executing in the job, upstream of the agent. The three workflows-over-a-PR
(`agent-review`, `agent-implement-pr`, `agent-update-branch`) run on `pull_request_target`,
which evaluates the workflow from the base branch but runs with this repo's secrets, and each
checks out `pull_request.head.sha`. On a fork PR that would put contributor-controlled code on
disk with `AGENT_PAT` persisted into `.git/config`, then feed it to `pnpm install` lifecycle
scripts and to the runner script itself.

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

## Per-workflow permissions matrix

**Recorded in spec §3.1** → "Per-workflow permissions matrix" (8 rows, columns `contents` /
`issues` / `pull-requests`). It is not duplicated here: each workflow (#344+) declares its
minimum `permissions:` from that table as it is implemented.

## Wall-clock guardrails: `timeout-minutes` + `AGENT_BUDGET_MINUTES`

Every runner step carries **two** ceilings, and the order between them is load-bearing:

| Workflow                               | Step `timeout-minutes` | `AGENT_BUDGET_MINUTES` |
| -------------------------------------- | ---------------------- | ---------------------- |
| `agent-implement` (implement pass)     | 30                     | 25                     |
| `agent-implement` (write-pr pass)      | 10                     | 8                      |
| `agent-implement-pr`                   | 30                     | 25                     |
| `agent-implement-prd` (implement pass) | 30                     | 25                     |
| `agent-implement-prd` (write-prd-pr)   | 10                     | 8                      |
| `agent-review`                         | 45                     | 40                     |
| `agent-to-issues-prd`                  | 30                     | 25                     |
| `agent-update-branch`                  | 30                     | 25                     |
| `architecture-review`                  | 20 (spec §4.8)         | 15                     |

**Why both.** A step `timeout-minutes` expiry is the one failure mode that escapes the §3.7
reporting machinery: Actions kills the process tree, so `runMain`'s catch never runs, no
`failure_reason.txt` is written, and the orchestrator can only comment "(no reason file
written)". On #512 that cost an entire review with no diagnosis. `AGENT_BUDGET_MINUTES` builds
an `AbortSignal` that the runner passes to sandcastle's `run()`, which aborts the agent
mid-iteration and rejects — turning the timeout back into an **ordinary throw** that the
existing failure plumbing reports normally.

**Why `agent-review` gets more.** Its prompt delegates the analysis to the `code-review` skill,
which fans out into parallel sub-agents, and the runner hands the agent a `--stat` summary
instead of the full patch — so the agent spends its own time reading the diff per file. Measured
review runs were 5-9 minutes end to end with a ~20 minute tail, already brushing the old 25.

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

### How it is tested (with the first chaining workflow, #344+)

There is no chaining workflow yet, so there is no degradation to exercise. Once the first one
exists (e.g. To Issues → Implement), the verification is:

1. With the repo **without** `AGENT_PAT` loaded, trigger the step that adds the label-trigger.
2. Confirm the label **appears** on the issue/PR (correct state).
3. Confirm the downstream workflow **did not** run (`gh run list` with no new run).
4. Re-add the label by hand and confirm it **does** trigger now.

The platform fact underpinning all of this — "label adds via `GITHUB_TOKEN` do not trigger
workflows" — is documented GitHub Actions behavior, not something to demonstrate per-repo; the
test above validates that _our_ implementation honors the contract.
