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

## Per-workflow permissions matrix

**Recorded in spec §3.1** → "Per-workflow permissions matrix" (8 rows, columns `contents` /
`issues` / `pull-requests`). It is not duplicated here: each workflow (#344+) declares its
minimum `permissions:` from that table as it is implemented.

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
