# AFK assets vendored from Matt Pocock

The AFK platform ("GitHub-Native Agent Platform") uses a set of assets from the public
repo [`mattpocock/course-video-manager`](https://github.com/mattpocock/course-video-manager)
as its **source of truth**. This repo **vendors** them (a local, adapted copy) so the 8
workflows and runners can be implemented without depending on reading the original repo.
Context: map
[Map: AFK platform on GitHub Actions](https://github.com/leomontigatti/en-escena/issues/319),
ticket [Vendor the AFK spec + prompts + do-work skill](https://github.com/leomontigatti/en-escena/issues/341).

## What was brought over

| Asset                                           | Local                                                        | Source                                                  |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Spec of the 8 workflows                         | [`afk-agent-platform-spec.md`](./afk-agent-platform-spec.md) | `docs/agents/afk-agent-platform-spec.md`                |
| Base runner prompts (9)                         | [`prompts/`](./prompts/)                                     | `docs/agents/prompts/*.prompt.md`                       |
| `do-work` skill (SKILL + DB-TDD + FRONTEND-TDD) | [`.claude/skills/do-work/`](../../.claude/skills/do-work/)   | `.claude/skills/do-work/{SKILL,DB-TDD,FRONTEND-TDD}.md` |

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
- **English PR titles.** The source leaves the language of the prose it asks for implicit,
  which is safe in a monolingual repo and ambiguous here: this product is Spanish and the
  history the agent reads for precedent is mostly Spanish commits. The `write-pr` and
  `write-prd-pr` prompts name the language and point at
  `.sandcastle/CODING_STANDARDS.md` § Code Language, which is what actually decides it.
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
- **Typecheck gate on §4.6's clean-merge path.** The spec invokes the update-branch agent only
  when `git merge` conflicts, so a textually clean merge is pushed without anything compiling
  the result — and a semantic conflict (the base reshapes a signature, the branch adds a caller
  in another file) slips through to CI (#567). `agent-update-branch.yml` adds a `pnpm typecheck`
  step **after** the push and the merge comment: the merge is kept, and a failure only flips the
  PR to `agent:blocked` with the compiler output, naming the semantic conflict instead of
  leaving a bare CI red.
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
  anchors against it. The skill is installed per run at `latest`, globally (outside the work tree, so
  the commit step cannot sweep it into the PR branch), exactly as upstream does.
- **The linked issue's body is embedded, not just its title.** Adopting the skill's Spec axis
  exposed a local gap that predated it: the review context fetched the issue with
  `--json title` only, so `<linked-issue>` expanded to a single line while the prompt asked the
  agent to verify coverage, scope, and interpretation against "the spec". It now fetches
  `--json title,body` and embeds the body.
- **The token-less runner is enforced, not just asserted (§3.9).** The spec's hard invariant is
  that the agent never mutates the tracker or the remote, and `agent-implement` /
  `agent-implement-prd` honour it by simply omitting `GH_TOKEN` from the runner step. The three
  runners that **prefetch** context (review, implement-pr, update-branch) cannot: they need the
  token for their own read-only `gh` calls. That was enough to break the invariant in practice —
  sandcastle's `noSandbox()` builds the agent's environment as `{ ...process.env }`, so the
  step-level `GH_TOKEN` reached the agent, whose `gh` calls would have **succeeded** with the
  job's write permissions. Only the prompt's "do not run `gh`" stood in the way, and a
  succeeding call leaves no trace in the logs. `revokeGitHubToken()`
  ([`lib/runner.mts`](../../.sandcastle/lib/runner.mts)) now drops `GH_TOKEN` / `GITHUB_TOKEN` /
  `GH_ENTERPRISE_TOKEN` after the prefetch and before `createAgent()`, in all three runners;
  `tests/afk/runner-token-revocation.test.ts` keeps the call ordered ahead of the agent.
- **`agent-review` gets a bigger wall-clock budget** (45 / 40 instead of the usual 30 / 25),
  because the skill's sub-agents and the agent's own per-file diff reading both cost time. The
  table and the reasoning are in [`afk-setup.md`](./afk-setup.md) → "Wall-clock guardrails"; the
  budget-below-timeout invariant is unchanged and still enforced by
  `tests/afk/failure-reason-fallback.test.ts`.
- **Promote Queued says what it does not promote (§4.7).** The gate stays exactly as specified
  (`state_reason != 'not_planned'` — a deferred or rejected decision genuinely unblocks nothing),
  but a `not planned` close is now the documented way to close a _deferred_ issue, so the local
  `agent-promote-queued.yml` adds a step ahead of it that comments on each `agent:queued`
  dependent it declines to promote. Behaviour unchanged, silence removed.
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
- **`FRONTEND-TDD.md`**: the source mandates using `useEffectReducer` from `use-effect-reducer`;
  this repo does **not** use that library (nor reducers today), so the "Reducer choice" section
  was left library-neutral, preserving the principle (state logic in a pure, testable module).

## What was **retired**

- **`to-prd` / `to-issues`** (removed): they were the AFK-native variants of the global HITL
  `to-spec` / `to-tickets`, vendored from the source's `to-prd-project` / `to-issues-project`.
  They are gone now that Matt Pocock's set is installed as the official
  [`mattpocock-skills` plugin](https://github.com/mattpocock/skills), which ships `to-spec` and
  `to-tickets` as a managed, always-current bundle — the local copies could only drift from it.
  [`afk-setup.md`](./afk-setup.md) → "With the `to-spec` / `to-tickets` skills" already describes
  the supported HITL path under the human-gated model: let the global skills publish with
  `ready-for-agent`, then add the matching `agent:*` label by hand to dispatch.
- **What this costs.** The removed skills produced the AFK sub-issue shape directly — a parent
  PRD plus ordered native sub-issues via `gh issue create --parent`, matching the unattended
  runner [`prompts/to-issues.prompt.md`](./prompts/to-issues.prompt.md). The global `to-tickets`
  models **blocking edges** instead of execution order, which `agent-implement-prd.yml` does not
  read (it reads **list order**). To get the AFK shape from a PRD, prefer the unattended path:
  label the PRD **`agent:to-issues`** and let the runner decompose it.

## What was **not** adapted (on purpose)

- **Appendix A** ("Reference implementation notes — Sandcastle / Claude Code") describes the
  original repo's reference stack; it is kept as-is, as documentation of that concrete
  realization. The runner ↔ orchestrator reconciliation is already complete via the phase
  tickets of map #319 (#344 for the orchestrator↔runner model, #347 for the cutover): the local
  Docker runner (`main.mts` + `*-prompt.md`) was retired and `.sandcastle/` today contains only
  the AFK runners (`agent-*/`), their helpers (`lib/`, `run-with-retry.mts`,
  `retry-feedback.mts`) and `CODING_STANDARDS.md`.
- The **prompts remain runner-neutral skeletons**: the "how the runner is invoked" half is made
  concrete when each workflow is wired.
