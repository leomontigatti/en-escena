# AFK assets vendored from Matt Pocock

The AFK platform ("GitHub-Native Agent Platform") uses a set of assets from the public
repo [`mattpocock/course-video-manager`](https://github.com/mattpocock/course-video-manager)
as its **source of truth**. This repo **vendors** them (a local, adapted copy) so the 8
workflows and runners can be implemented without depending on reading the original repo.
Context: map
[Map: AFK platform on GitHub Actions](https://github.com/leomontigatti/en-escena/issues/319),
ticket [Vendor the AFK spec + prompts + do-work skill](https://github.com/leomontigatti/en-escena/issues/341).

## What was brought over

| Asset                                                | Local                                                                                                                    | Source                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Spec of the 8 workflows                              | [`afk-agent-platform-spec.md`](./afk-agent-platform-spec.md)                                                             | `docs/agents/afk-agent-platform-spec.md`                     |
| Base runner prompts (9)                              | [`prompts/`](./prompts/)                                                                                                 | `docs/agents/prompts/*.prompt.md`                            |
| `do-work` skill (SKILL + DB-TDD + FRONTEND-TDD)      | [`.claude/skills/do-work/`](../../.claude/skills/do-work/)                                                               | `.claude/skills/do-work/{SKILL,DB-TDD,FRONTEND-TDD}.md`      |
| `to-prd` / `to-issues` skills (local HITL authoring) | [`.claude/skills/to-prd/`](../../.claude/skills/to-prd/), [`.claude/skills/to-issues/`](../../.claude/skills/to-issues/) | `.claude/skills/{to-prd-project,to-issues-project}/SKILL.md` |

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
- **`FRONTEND-TDD.md`**: the source mandates using `useEffectReducer` from `use-effect-reducer`;
  this repo does **not** use that library (nor reducers today), so the "Reducer choice" section
  was left library-neutral, preserving the principle (state logic in a pure, testable module).
- **`to-prd` / `to-issues`**: these are the AFK-native variants of the global HITL `to-spec` /
  `to-tickets`. The base is the source's `to-prd-project` / `to-issues-project` (parent-PRD
  model + ordered native sub-issues + `agent:implement`), folded together with the **most
  recent** content of the global `to-spec`/`to-tickets`: the framing of _seams_ to test
  (`to-spec`), the _wide refactor / expand→migrate→contract_ guidance (`to-tickets`, restated
  for execution order rather than blocking-edges), and `disable-model-invocation: true`.
  The **blocking-edges/frontier** model was dropped from `to-tickets` because
  `agent-implement-prd.yml` reads **list order**, not explicit dependencies. They publish with
  `gh issue create --parent` (the [`issue-tracker.md`](./issue-tracker.md) convention) instead
  of the manual `sub_issues` API dance, and they apply no `agent:*` label (dispatch is human,
  see [`afk-setup.md`](./afk-setup.md)). They produce the **same sub-issue shape** as the
  unattended runner [`prompts/to-issues.prompt.md`](./prompts/to-issues.prompt.md).

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
