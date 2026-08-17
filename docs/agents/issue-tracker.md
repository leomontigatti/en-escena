# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.
Do not use GitHub connector/MCP app tools for this repo. The local `gh` auth is
the source of truth for issue and pull request operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. When creating implementation issues from a PRD issue, use `--parent <PRD_NUMBER>` so GitHub records them as native sub-issues.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels. For a **closed** issue read the outcome too — `gh issue view <number> --json number,title,state,stateReason,closedAt,labels,comments`; neither the plain-text view nor `gh issue list` prints `stateReason`, and with `--json` every field is opt-in, so it is invisible unless asked for. See [Reading a closed issue](#reading-a-closed-issue).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters. When listing with `--state closed` or `--state all`, add `stateReason,closedAt` to `--json` and to the `--jq` projection.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --reason <completed|"not planned"|duplicate> --comment "Closure: ..."`, or `gh issue close <number> --duplicate-of <number>` — see [Closing an issue](#closing-an-issue) for which reason and whether a comment is needed.

Infer the repo from `git remote -v` - `gh` does this automatically when run inside a clone.

## Closing an issue

Closing means **a decision was made**. It does not mean the code changed. Five
outcomes close an issue, and the closure has to say which one:

| Outcome             | Meaning                                                         | How to close                                                     | Closing comment                                  |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| **Built**           | The decision is in the code on `master`.                        | a merged PR whose body says `Closes #N`, or `--reason completed` | none required — the merged PR is the evidence    |
| **Deferred**        | The decision stands; the work moved to a named follow-up issue. | `--reason "not planned"`                                         | **required**: `Closure: deferred to #<number>`   |
| **Decided against** | Considered and rejected.                                        | `--reason "not planned"`                                         | **required**: `Closure: decided against — <why>` |
| **Out of scope**    | Not this repository's problem, or not a problem.                | `--reason "not planned"`                                         | **required**: `Closure: out of scope — <why>`    |
| **Duplicate**       | Already tracked by another issue.                               | `--duplicate-of <number>`                                        | none required — GitHub records the link          |

Rules:

- **Only "built" closes as `COMPLETED`.** Deferred, decided against and out of
  scope are `not planned`; a duplicate is `DUPLICATE`, which GitHub marks
  natively when you pass `--duplicate-of` (do not force duplicates into "out of
  scope" — the native marking is better than any comment). That is the whole
  point: `stateReason` is the field a reader gets to first, and an issue that
  closes `COMPLETED` claims the code changed. It is not printed by default,
  though — ask for it (see the read and list recipes above).
- **"Built" means verified on `master`,** not that a PR exists or a plan was
  agreed. If you cannot point at the merged change, the outcome is one of the
  other four.
- **The `Closure:` comment is required for the three `not planned` outcomes,
  and only for them.** `--reason` cannot tell deferred from rejected from out of
  scope, so the comment is what separates them. "Built" needs no comment,
  because the overwhelmingly common way an issue gets built here is automatic:
  a PR body carries `Closes #N` (mandated for every agent-written PR — see
  [`prompts/write-pr.prompt.md`](./prompts/write-pr.prompt.md)) and GitHub closes
  the issue as `COMPLETED` on merge, linking the PR. Nobody runs `gh issue close`
  on that path and nothing could inject a comment into it. Requiring one would
  make the convention unfollowable exactly where it matters least: the merged PR
  already proves the claim.
- **A deferral must name its follow-up issue _and_ move its dependents.**
  `deferred to #712` is a deferral; "deferred" alone is indistinguishable from
  work that was done. Open the follow-up first, then close. And before closing,
  re-point anything blocked on this issue at the follow-up:
  [`agent-promote-queued.yml`](../../.github/workflows/agent-promote-queued.yml)
  only promotes dependents when the blocker closes as something other than
  `not_planned` (spec §4.7 — a decision that was deferred or rejected genuinely
  did not deliver what the dependent is waiting for). So a deferral leaves every
  `agent:queued` dependent queued. That is intended, not a bug; the workflow
  comments on each dependent it declines to promote, but only the person closing
  can declare the follow-up as the new blocker.

Everything is one command, so there is nothing to remember beyond the flag:

```sh
gh issue close 712 --reason "not planned" \
  --comment "Closure: deferred to #715 — the threshold rewrite lands there."
```

**Relation to the `wontfix` label.** [`triage-labels.md`](./triage-labels.md)
keeps `wontfix` ("will not be actioned") as a **triage** label: it says what the
maintainer decided about an _open_ issue. Once the issue is closed, `stateReason`
plus the `Closure:` comment carry the outcome, and the label adds nothing —
"decided against" and "out of scope" subsume it. Do not apply it on the way out;
there is no need to remove it if it is already there.

### Reading a closed issue

**Do not infer from `CLOSED` that anything was built.** Issues closed before this
convention landed — that is, before [#722](https://github.com/leomontigatti/en-escena/pull/722),
merged in August 2026, so check `closedAt` — all carry `stateReason: COMPLETED`
regardless of outcome, so for those the field carries no information at all.
Check the code, or the closing discussion, before repeating the claim anywhere
durable.

The converse holds for PRD sub-issues: **an open sub-issue may already be
implemented.** `agent-implement-prd.yml` implements one sub-issue per run onto a
shared branch and leaves it open, marking it with an `Implemented in <sha>`
comment; the PR closes the whole chain on merge. Open therefore means "not on
`master` yet", which is the honest reading.

This is not hypothetical. `docs/adr/superseded/0011-invoicing-concept-portion-and-surfaces.md:5-7`
and `docs/adr/0014-arbitrary-amount-allocation-and-comprobante-amendments.md:32-34`
both state that
[#554](https://github.com/leomontigatti/en-escena/issues/554) deleted `porcion`
"outright — column, pgEnum, `derivePorcion`, `formatComprobantePorcionLabel` and
every reader". It did not. Every symbol that sentence names was still live when
each ADR was written: `porcion` was a `NOT NULL` enum column, derived at emission
and printed on the invoice. The issue was closed `COMPLETED` and read as done.
`porcion` has since been removed — by
[#723](https://github.com/leomontigatti/en-escena/pull/723), eight days after
#554 closed — which does not weaken the example. The ADRs were wrong when
written; that reality later caught up, by a separate deliberate act, is not a
defence for having claimed it early.
[#621](https://github.com/leomontigatti/en-escena/issues/621) ("what holds the
`NOT NULL` `selectedPriceId`") closed the same way, and `selectedPriceId` is
nullable, written only by later updates and never by a creation path.
[#650](https://github.com/leomontigatti/en-escena/issues/650) ("Refunds") closed
the same way, and there is no refund table. ADRs are append-only, so an error in
one is permanent until someone appends a correction: ADR-0014's landed in #723,
and ADR-0011's is still pending.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
