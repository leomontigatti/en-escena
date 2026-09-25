# ADR-0016: Implementation and review happen in local sessions

**Status**: accepted

Date: 2026-09-25

Source: the browser-and-UI-verification investigation of 2026-09-25, in the
T3 Code thread that produced this ADR.

Between #319 and #1199 this repo built the AFK platform of
[afk-agent-platform-spec.md](../agents/afk-agent-platform-spec.md): eight
GitHub Actions workflows, four of which wrote or reviewed code without a human
present. This ADR retires those four — Implement, Implement PRD, Implement PR
and Review — and keeps the other four. It records **why**; the current setup
is in [afk-setup.md](../agents/afk-setup.md) and
[workflows.md](../agents/workflows.md) § Where work starts.

## 1. The runner could not see the product

An implement run on `ubuntu-latest` had no `.env`, no dev server, no browser
and nobody to ask. For a product that is mostly screens, that meant every
layout, empty-state and copy mistake reached review unseen, and the
[UI evidence rule](../agents/pull-requests.md#ui-evidence) had to exempt the
runner that produced most PRs. A local T3 Code session has the dev server, a
scriptable browser, the dev database and the user in the same thread, so the
agent verifies its own work before the PR exists and the screenshot it took to
verify is the evidence it attaches.

## 2. The loop was slow where it mattered

Measured on 2026-09-24: an implement pass took 8 to 30 minutes and a review
pass 17 to 19, each starting from a cold checkout on a 2-core runner. A failing
test at the end of a pass cost another whole pass. In a session the same
fix-and-recheck cycle is seconds, and the repository is read once.

## 3. Two reviews were one review paid twice

The `implement` skill already ends with the two-axis `code-review` before the
commit. The AFK Review runner re-read the same diff after the push, on the same
token budget, and its one extra input — CI's verdict — is what `gh pr checks`
gives a session for free. The rejection in ADR-0015 § Rejected of "hosted or
generic LLM reviewers" was argued against a _generic_ reviewer replacing a
repo-aware one; a hosted reviewer as a second, cheap pair of eyes on a PR that
a repo-aware session already reviewed is a different proposal and is not
decided here.

## 4. Budget

One Claude subscription serves both the sessions and the runners. Every AFK
pass spent that quota re-reading the repo, and the runners re-ran on every
review round. Retiring them is the largest single saving available without
changing how the code is written.

## What stays, and why

- **To Issues** decomposes a PRD into sub-issues. Cheap, needs no browser, and
  the PRD is the tier of work where a written spec earns its cost.
- **Update Branch** and **Label Behind PRs** keep open PRs mergeable under
  strict branch protection. Label Behind now covers every non-bot branch, not
  only `agent/*`.
- **Promote Queued** still lifts a blocked issue when its blockers close, but
  to `ready-for-agent` — the triage label a session grabs from — instead of a
  trigger that no longer exists. It therefore needs no PAT.
- **Architecture Review** proposes one PRD per weekday. It spends quota; the
  user can pause its schedule without touching this decision.

## Consequences

- `agent:implement`, `agent:review`, `agent:ready` and `agent:needs-decision`
  are no longer in `.github/labels.json`. `pnpm labels:sync` never deletes, so
  they remain on GitHub until removed by hand.
- The `review-triage` skill and `pnpm afk:watch` were built on the retired
  labels and are gone with them. Babysitting a PR is described in
  [pull-requests.md](../agents/pull-requests.md#babysitting-a-pr).
- The `agent/` branch prefix is no longer reserved.
- A session implements a PRD's sub-issues in list order onto one branch, as
  Implement PRD did, and leaves each sub-issue open with an
  `Implemented in <sha>` comment.
- The `implement` skill is the only implementation workflow. Browser
  verification joins it as a step, with the Playwright CLI, in the change that
  follows this one.
