# AFK assets vendored from Matt Pocock

> **Mostly retired (ADR-0016).** The implement, review, write-PR, To Issues, Update Branch,
> Label Behind PRs and Promote Queued runners and their runtime prompts are gone; implementation,
> review, PRD slicing and branch updates happen in local sessions. Architecture Review is the
> only workflow left. The text below describes the vendoring as it was done.

The AFK platform ("GitHub-Native Agent Platform") uses a set of assets from the public
repo [`mattpocock/course-video-manager`](https://github.com/mattpocock/course-video-manager)
as its **source of truth**. This repo **vendors** them (a local, adapted copy) so the 8
workflows and runners can be implemented without depending on reading the original repo.
Context: map
[Map: AFK platform on GitHub Actions](https://github.com/leomontigatti/en-escena/issues/319),
ticket [Vendor the AFK spec + prompts + do-work skill](https://github.com/leomontigatti/en-escena/issues/341).

## What was brought over

| Asset                                    | Local                                                          | Source                                                  |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Spec of the 8 workflows                  | [`afk-agent-platform-spec.md`](./afk-agent-platform-spec.md)   | `docs/agents/afk-agent-platform-spec.md`                |
| Base runner prompts (9)                  | [`prompts/`](./prompts/)                                       | `docs/agents/prompts/*.prompt.md`                       |
| `implement` skill, vendored as `do-work` | [`.claude/skills/implement/`](../../.claude/skills/implement/) | `.claude/skills/do-work/{SKILL,DB-TDD,FRONTEND-TDD}.md` |

## What was adapted vs. the source

The bulk of the spec is **runner-neutral by design** and was copied faithfully. The changes
are only concrete references to this repo:

- **Base branch `master`** instead of `main` (our default): branch names, `git diff`,
  `--base`, checkouts, examples.
- **Validation commands `pnpm typecheck` / `pnpm test`** where the source said generically
  "the project's typecheck/tests" (see [`workflows.md`](./workflows.md); `pnpm test` = unit +
  DB-PGlite, `pnpm typecheck` runs typegen + `tsc --noEmit`).
- **Concrete context docs**: `CONTEXT.md`, `docs/adr/` (binding ADRs) and
  [`domain.md`](./domain.md), instead of the source's generic `CONTEXT.md`/ADRs.
- **Coding standards** pointing at `.sandcastle/CODING_STANDARDS.md` (canonical) and
  [`style-guide.md`](./style-guide.md) for frontend/UI.
- **English PR prose and commit messages.** The source leaves the language of the prose it asks
  for implicit, which is safe in a monolingual repo and ambiguous here: this product is Spanish
  and the history the agent reads for precedent is mostly Spanish commits. So every prompt whose
  agent writes prose that lands on a PR or in the history names the language itself and points at
  `.sandcastle/CODING_STANDARDS.md` § Code Language, which is what actually decides it, with the
  backtick exception for Spanish data. That is `write-pr` and `write-prd-pr` for `prTitle` and
  `prDescription`, and `implement`, `implement-prd`, `implement-pr`, `review` and `update-branch`
  for the commit subject and body. A gate on the PR title is tracked separately (#1007); until
  it exists, and for the body and the commits regardless, the prompts are the whole answer.
- **Short PR bodies.** The source's `prDescription` skeleton is a `## Summary` heading over
  bullets with no guidance on length, and on this repo it produced bodies that restated the
  issue. `write-pr` and `write-prd-pr` now follow [`pull-requests.md`](./pull-requests.md):
  problem, then fix, no headings on a single-issue PR, one paragraph over the sub-issue list on a
  PRD PR. The single-pass writer ran nothing, so it may only report validation that the commit
  messages state (#1114).
- **`gh` tracker** (GitHub Issues): the prompts use `gh issue view … --comments` instead of the
  source's "project-specific" placeholders.
- **Appendix C** of the spec: `backlog.md` → [`issue-tracker.md`](./issue-tracker.md) (our
  equivalent); `queued-promotion.md` **does not exist** here (its behavior lives entirely in
  §4.7 of the spec); the link to `domain.md`/`CONTEXT.md`/`docs/adr/` was added.
- **Wall-clock guardrails on top of §3.7/§3.8.** The spec's runner contract lists the workflow's
  env vars and gives `"(no reason file written — check workflow logs)"` as the fallback when
  `failure_reason.txt` is absent. In practice that fallback fires for the one case it cannot
  explain — a step `timeout-minutes` expiry kills the process tree before the runner can write
  anything (#512). Two local additions close it, without changing the contract's shape: an
  `AGENT_BUDGET_MINUTES` env var per runner step (an internal deadline below the step's, turning
  the timeout into an ordinary throw) and the `*.agent.log` upload artifact, whose tail the
  `failure()` steps read before falling back to the spec's message. Both are documented in
  [`afk-setup.md`](./afk-setup.md) → "Wall-clock guardrails".
- **A completion after the budget counts, and the implement passes get 60 / 50.** The budget's
  abort cannot stop an agent under `noSandbox()`, so an agent close to done finishes past the
  deadline and `run()` still rejects — run 34715632348 reported a committed #917 as failed.
  `runMain` treats that case as success when the completion signal was seen and the tree is
  clean (opt-in: `implement` and `implement-prd` as is; `implement-pr` recovers its structured
  output from the agent's own text, #1186), the three implement passes move to 60 / 50, and the
  prompts state the budget and ask for checkpoint commits. Details in
  [`afk-setup.md`](./afk-setup.md) → "Wall-clock guardrails".
- **A local workflow beside the eight, feeding the sixth (#1020)** (retired). The spec has
  Update Branch triggered by a human applying `agent:update-branch` (§4.6). Branch protection
  here is strict, so every open `agent/*` PR was behind `master` the moment the one below it
  merged, and in practice that hand was the driving session's, once per PR, on a decision
  needing no judgement. `agent-label-behind-prs.yml` applied the label on `push` to `master`
  instead, kept deliberately thin (no agent, no runner, no checkout). Retired with Update Branch
  itself (ADR-0016, amendment of 2026-09-26): a PR behind `master` is now brought up to date by
  the [`babysit-pr`](../../.claude/skills/babysit-pr/SKILL.md) skill, once, when that is the only
  thing between it and merge.
- **No credential persisted by the checkout (#956)** (retired). The spec's runner steps (§4.2 step 2,
  §4.3 step 3, §4.5 step 2 and their siblings) read "Checkout … with `AGENT_PAT ||
GITHUB_TOKEN` (PAT lets the push include workflow changes)", which relies on
  `actions/checkout` persisting that token into `.git/config` for the push at the end of the
  job. Here every checkout sets `persist-credentials: false` and takes no `token:`; the push
  steps authenticated per command with `PUSH_TOKEN: ${{ secrets.AGENT_PAT || github.token }}`
  scoped to that step, and the identity step refused to start the agent over a persisted
  credential. This applied to the runners that pushed (Update Branch chief among them); none of
  the remaining Architecture Review workflow's steps push, and `AGENT_PAT` is no longer loaded
  (ADR-0016, amendment of 2026-09-26).
- **Typecheck gate on §4.6's clean-merge path** (retired with Update Branch). The spec invoked
  the update-branch agent only when `git merge` conflicted, so a textually clean merge was
  pushed without anything compiling the result — and a semantic conflict (the base reshapes a
  signature, the branch adds a caller in another file) slipped through to CI (#567).
  `agent-update-branch.yml` added a `pnpm typecheck` step **after** the push and the merge
  comment to catch it. `gh pr update-branch`, which the `babysit-pr` skill now uses for a clean
  merge, runs no such gate; a semantic conflict it lets through is caught by CI same as before
  #567, under the babysitting session's watch.
- **Sub-issues are not closed at implementation time (§4.3).** The spec's step 7 runs
  `gh issue close $SUB --comment "Implemented in <sha>. Part of #$PRD."` right before the draft
  PR is opened — a `COMPLETED` close asserting the work is built while it sits on a shared
  branch that may never merge. That is exactly the false `COMPLETED` that
  [`issue-tracker.md`](./issue-tracker.md) → "Closing an issue" exists to prevent, produced by
  machine on every sub-issue. Locally `agent-implement-prd.yml` **comments** instead
  (`Implemented in <sha> on <branch>` plus an `<!-- afk:implemented -->` marker), keeps the
  sub-issue open, and lets the PR close it on merge — when `COMPLETED` is true because it is on
  `master`. Three consequences follow, all local: the draft PR body carries one `Closes #<sub>`
  per sub-issue (appended by the orchestrator, since nothing else closes them now), and both the
  preflight target and the chain's "remaining" count read the marker instead of the issue state
  (counting open sub-issues would never reach zero and the chain would loop). The spec's
  refusal row "all sub-issues already closed" becomes "every sub-issue already implemented", and
  the runtime implement-prd prompt drops the skeleton's "the workflow closes the sub-issue"
  ([`prompts/implement-prd.prompt.md`](./prompts/implement-prd.prompt.md) line 44 keeps the
  source's wording). The rule this serves is in
  [`issue-tracker.md`](./issue-tracker.md#closing-an-issue).
- **Review delegates its analysis to the `code-review` skill (§4.4), and reads the diff itself.**
  Upstream moved the review agent off an ad-hoc pass and onto Matt Pocock's `code-review` skill,
  which audits the diff along a **Standards** and a **Spec** axis in parallel sub-agents, and at
  the same time stopped embedding the full patch in favour of a `git diff --stat` summary the
  agent drills into per file. Both are adopted here. Two local differences follow from the
  runner contract: the agent holds **no GitHub token** (§3.9), so where upstream tells the skill
  to pull a PRD's sub-issues with `gh api`, the **runner** prefetches them and embeds them as a
  `<sub-issues>` list (state included, so an open sub-issue's code still reads as a scope
  violation); and `.sandcastle/agent-review/context.mts` keeps fetching the **full** patch even
  though the prompt only shows `--stat`, because `diff-anchors.mts` validates the agent's inline
  anchors against it. The skill is installed per run globally (outside the work tree, so the
  commit step cannot sweep it into the PR branch) as upstream does, but **from this repo's
  vendored copy on `origin/master`** rather than from the network: since
  [#965](https://github.com/leomontigatti/en-escena/issues/965) the skill lives in
  `.agents/skills/code-review`, and reading it from the checked-out tree would let a
  `pull_request_target` PR edit the reviewer that reviews it
  ([#966](https://github.com/leomontigatti/en-escena/issues/966)).
  **`agent-implement-pr` embeds `--stat` too** (#789), which keeps rather than widens this
  deviation: spec §4.5 defines its inputs as _"identical to Review"_
  ([line 829](./afk-agent-platform-spec.md)), so the two runners drifting apart on the diff
  shape is what would have broken the contract. It adopts only the summary, not the skill —
  an implement-pr pass acts on the conversation instead of auditing. Its 60/50 budget matches the
  other implement passes, not Review's 45/40 for the sub-agent fan-out (rationale in
  [`afk-setup.md`](./afk-setup.md#wall-clock-guardrails-timeout-minutes--agent_budget_minutes)).
- **The linked issue's body is embedded, not just its title.** Adopting the skill's Spec axis
  exposed a local gap that predated it: the review context fetched the issue with
  `--json title` only, so `<linked-issue>` expanded to a single line while the prompt asked the
  agent to verify coverage, scope, and interpretation against "the spec". It now fetches
  `--json title,body` and embeds the body.
- **A PR that links no issue is refused in preflight, not mid-run (§4.4/§4.5).** The spec gives
  Review "Preconditions & refusals: none — labeling implies intent", and both Review and
  Implement PR read the linked issue out of the PR body via the same prefetch. That parse used
  to **throw**, so a PR with no `Closes #N` burned the label transition, the checkout and the
  installs before failing and leaving `agent:blocked` for a human to clear (#790). Locally the
  linked issue is **optional** in `context.mts` (the fields are nullable and the sub-issue
  lookup is skipped), and the two callers diverge as their contracts do: `agent-implement-pr`
  acts on the conversation and only shows the issue "for context only", so it degrades to
  `(none — this PR links no issue)` and runs; `agent-review`'s Spec axis checks the diff against
  the issue **body**, so `agent-review.yml` grows the preflight the spec says it has none of —
  refusing a closed PR and one linking no issue by removing the label and commenting, never
  adding `agent:blocked` (nothing failed, the run was declined), in the vocabulary
  `agent-implement-pr.yml` already uses. Teaching Review a Standards-only, spec-less mode stays
  out of scope. Every step of a preflighted workflow is gated on its `proceed` output, which
  `tests/afk/workflow-preflight-gating.test.ts` asserts across every workflow that has one — by
  evaluating each condition on a refused run rather than matching how it is spelled, because the
  two spellings differ where it matters. Review's failure report is gated on `!= 'false'`, not
  `== 'true'`: a preflight that _itself_ fails leaves `proceed` unset, and `== 'true'` would
  report neither the refusal nor the failure. The other four preflighted workflows still carry
  the `== 'true'` spelling, so a failing preflight is silent there.
- **The token-less runner is enforced, not just asserted (§3.9).** The spec's hard invariant is
  that the agent never mutates the tracker or the remote. Runners that **prefetch** context with
  a read-only `gh` call cannot get there by simply omitting `GH_TOKEN` from the runner step, the
  way `agent-implement` / `agent-implement-prd` (both since retired) did. That was enough to
  break the invariant in practice — sandcastle's `noSandbox()` builds the agent's environment as
  `{ ...process.env }`, so the step-level `GH_TOKEN` reached the agent, whose `gh` calls would
  have **succeeded** with the job's write permissions. Only the prompt's "do not run `gh`" stood
  in the way, and a succeeding call leaves no trace in the logs. `revokeGitHubToken()`
  ([`lib/runner.mts`](../../.sandcastle/lib/runner.mts)) drops `GH_TOKEN` / `GITHUB_TOKEN` /
  `GH_ENTERPRISE_TOKEN` after the prefetch and before `createAgent()`; review, implement-pr and
  update-branch all called it before their retirement, and `architecture-review` is the runner
  that calls it now, revoking the token it used to read prior proposals before the agent starts.
  `tests/afk/runner-token-revocation.test.ts` keeps the call ordered ahead of the agent.
- **`agent-review` gets a bigger wall-clock budget** (45 / 40 instead of the usual 30 / 25),
  because the skill's sub-agents and the agent's own per-file diff reading both cost time. The
  table and the reasoning are in [`afk-setup.md`](./afk-setup.md) → "Wall-clock guardrails"; the
  budget-below-timeout invariant is unchanged and still enforced by
  `tests/afk/failure-reason-fallback.test.ts`.
- **Promote Queued says what it does not promote (§4.7)** (retired). The gate stayed exactly as
  specified (`state_reason != 'not_planned'` — a deferred or rejected decision genuinely unblocks
  nothing), but a `not planned` close was the documented way to close a _deferred_ issue, so the
  local `agent-promote-queued.yml` added a step ahead of it that commented on each `agent:queued`
  dependent it declined to promote. Retired with the workflow itself (ADR-0016, amendment of
  2026-09-26): blocking is now read from GitHub's native `blockedBy` relation by the session
  picking unblocked issues, so `agent:queued` has no user left.
- **Architecture Review runs weekly, not per weekday (§4.8).** The spec's reference trigger is
  `0 9 * * 1-5` and its stated purpose is "one architectural-improvement PRD per weekday";
  locally `architecture-review.yml` uses `0 9 * * 1` (Mondays). The cadence assumes proposals
  are consumed at roughly the rate they are produced, and here they were not: between
  2026-07-20 and 2026-09-01 the workflow proposed 33 PRDs, of which 5 were resolved (3 built,
  2 decided against) and 28 were still open and untriaged — four of those five closures
  happening in a single window, with none in the three weeks that followed. Nothing was wrong
  with the proposals; the queue simply grew about five times faster than it drained, and a
  backlog of un-triaged architectural PRDs is itself the kind of debt the workflow exists to
  find. Weekly keeps the pass and lets the queue drain. The agent's own duplicate-avoidance
  rule makes the cadence load-bearing in a second way: each run must find a target "not already
  proposed", so a faster cadence pushes it toward ever more marginal candidates. Nothing else
  about §4.8 changes — same runner contract, same read-only agent, same single publisher.
- **Architecture Review also reports documentation drift (§4.8).** The runtime prompt adds one
  rule the skeleton does not have: a contradiction between a current-state document and the code
  the agent happened to read is listed under `### Documentation drift` in the PRD's Further
  Notes (or in `reason` on a skip). It rides the existing output fields, so the schema and the
  publisher are untouched. This is a trial of whether a scheduled docs-staleness pass would earn
  its own workflow: the deterministic side is already covered (`check:doc-map`, and the link and
  path self-checks in `app/lib/shared/domain-docs.test.ts`), and what is left is semantic drift
  only a reader catches. If the heading keeps coming back empty, drop the rule.
- **`FRONTEND-TDD.md`**: the source mandates using `useEffectReducer` from `use-effect-reducer`;
  this repo does **not** use that library (nor reducers today), so the "Reducer choice" section
  was left library-neutral, preserving the principle (state logic in a pure, testable module).

- **`do-work` became `implement`, and test-first became the `tdd` skill.** The source's
  `do-work` names red-green only for DB code and complex frontend state, and the skeleton
  prompts say "use red-green-refactor where applicable" with nothing behind the phrase. Locally
  the skill is renamed after `implement` in `mattpocock/skills` and reshaped like it: it calls
  the vendored `tdd` skill for every change, keeps `DB-TDD.md` / `FRONTEND-TDD.md` as this repo's
  detail on top, and ends on `code-review`. The two runtime implement prompts follow the same
  workflow up to validation (review is its own workflow, §4.4). One thing had to bend: `tdd`
  tests only at seams **confirmed with the user**, and a runner has no user, so the seams are
  agreed upstream instead: the PRD's **Testing Decisions**, a **Test seams** section on every
  slice `to-tickets` publishes, and the wayfinder ticket that decided them
  ([`issue-tracker.md`](./issue-tracker.md#test-seams)). A runner that finds none chooses them
  and says so in the commit body. The validation cadence is the same in both places: typecheck
  and single test files as you go, the [`VALIDATION.md`](../../.sandcastle/VALIDATION.md) list
  once at the end.
- **The runtime prompts route to `codebase-design` and `domain-modeling`.** Nothing invoked
  either skill outside a wayfinder session, and a runner has nobody to type the slash command.
  `implement` and `implement-prd` (both since retired) called `codebase-design` when where a seam belongs
  is the question and `domain-modeling` when a domain term, `CONTEXT.md` or an ADR changed;
  `architecture-review` calls `codebase-design` up front, since its candidates are judged in
  that vocabulary.

## Matt Pocock skills

The skills this repo uses from [`mattpocock/skills`](https://github.com/mattpocock/skills) are
vendored under `.agents/skills/<name>/`, symlinked from `.claude/skills/<name>` and recorded in
`skills-lock.json`. They
replace the user-scope `mattpocock-skills@claude-plugins-official` plugin, which did not keep
itself current and made local sessions and the runners use different skill versions (#965).
Vendored skills load unprefixed: `/grilling`, not `/mattpocock-skills:grilling`.

| Skill                       | Upstream path                                  |
| --------------------------- | ---------------------------------------------- |
| `code-review`               | `skills/engineering/code-review`               |
| `codebase-design`           | `skills/engineering/codebase-design`           |
| `domain-modeling`           | `skills/engineering/domain-modeling`           |
| `prototype`                 | `skills/engineering/prototype`                 |
| `resolving-merge-conflicts` | `skills/engineering/resolving-merge-conflicts` |
| `tdd`                       | `skills/engineering/tdd`                       |
| `to-spec`                   | `skills/engineering/to-spec`                   |
| `to-tickets`                | `skills/engineering/to-tickets`                |
| `wayfinder`                 | `skills/engineering/wayfinder`                 |
| `grilling`                  | `skills/productivity/grilling`                 |
| `handoff`                   | `skills/productivity/handoff`                  |
| `writing-for-agents`        | `skills/productivity/writing-for-agents`       |

**Pin.** Vendored from `mattpocock/skills` at commit `959a8e9f1edc3adbe2f7e3054bb6fbefa6696260`
(2026-09-15, after tag `v1.2.3`), with `skills@1.6.0`. `tdd` was added on 2026-09-21 from
`c55ee460`, where its files are identical to the pinned commit's; so were `to-spec` and
`to-tickets`, added on 2026-09-25 from the same `c55ee460`. `skills-lock.json` holds each skill's
content hash.

**No local edits.** The files are byte-identical to upstream, so the hashes stay true.
`.agents/skills` is in `.prettierignore`, `check:comment-language` skips `.agents`, and each
skill's `agents/openai.yaml` is listed in its `excludedYamlFiles`. A repo-specific instruction
goes in the prompt or doc that invokes the skill, never in the skill.

**Not vendored**: `setup-matt-pocock-skills` (its output, [`issue-tracker.md`](./issue-tracker.md),
[`triage-labels.md`](./triage-labels.md) and [`domain.md`](./domain.md), already exists), and
`triage` and `grill-me` (rarely or never used). `research` was vendored
and then dropped: the `research` agent (`.claude/agents/research.md`) does that job, and
[`issue-tracker.md`](./issue-tracker.md#research-tickets) tells `wayfinder` to spawn it where the
skill's text says to call the `research` skill. `code-review` and
`wayfinder` still say "tell the user to run `/setup-matt-pocock-skills`", but only when
`docs/agents/issue-tracker.md` is missing, which does not happen here.
`.sandcastle/agent-review/prompt.md` overrides that path for the runner anyway.

**Sync.** Read the upstream diff since the pinned commit first. If it is wanted, re-run from the
repo root with a pinned CLI version:

```sh
pnpm dlx skills@<version> add mattpocock/skills -a claude-code -y --copy \
  -s code-review -s codebase-design -s domain-modeling -s prototype -s tdd \
  -s to-spec -s to-tickets -s resolving-merge-conflicts -s wayfinder -s grilling -s handoff -s writing-for-agents
```

It installs into `.claude/skills/`: move each directory to `.agents/skills/`, restore the
symlink, then commit the changed hashes and update the commit above. Adding a skill means adding
it to the table, the command and `excludedYamlFiles`.

## What was **retired**

- **`to-prd` / `to-issues`** (removed): they were the AFK-native variants of the global HITL
  `to-spec` / `to-tickets`, vendored from the source's `to-prd-project` / `to-issues-project`.
  They were removed when Matt Pocock's set was installed as the `mattpocock-skills` plugin,
  which shipped `to-spec` and `to-tickets`, and the unattended To Issues runner did the slicing
  until its own retirement (ADR-0016, amendment of 2026-09-25). `to-spec` and `to-tickets` are
  now vendored (table above), and the sub-issue shape the runner produced (native sub-issues in
  list order, a test-seams section on each) is this repo's delta on top of them, in
  [`issue-tracker.md`](./issue-tracker.md#ticket-operations).

## What was **not** adapted (on purpose)

- **Appendix A** ("Reference implementation notes — Sandcastle / Claude Code") describes the
  original repo's reference stack; it is kept as-is, as documentation of that concrete
  realization. The runner ↔ orchestrator reconciliation is already complete via the phase
  tickets of map #319 (#344 for the orchestrator↔runner model, #347 for the cutover): the local
  Docker runner (`main.mts` + `*-prompt.md`) was retired and `.sandcastle/` today contains only
  the surviving AFK runners (`agent-*/`), their helpers (`lib/`, `retry-feedback.mts`) and
  `CODING_STANDARDS.md`.
- The **prompts remain runner-neutral skeletons**: the "how the runner is invoked" half is made
  concrete when each workflow is wired.
