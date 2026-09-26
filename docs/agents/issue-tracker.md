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

## Filing an issue from an investigation

When a session files an issue out of something it investigated (a bug it hit, a
finding from a review, a comparison), the body carries what the next reader
cannot rebuild cheaply, in this order:

1. **What happened**, or what is missing, as the user or maintainer sees it.
2. **Diagnosis**, grounded in source: `path:line`, the command and its output,
   the PR or commit. A guess is labelled as a guess.
3. **Steps to reproduce**, for a bug, when a deterministic path was found.
4. **Evidence**: only the relevant log lines or output, never a dump, and
   nothing from a database refreshed from production.
5. **Related issues**, and why this one is not a duplicate of them.
6. **What to build** and **acceptance criteria**, when the issue is meant to be
   `ready-for-agent`; an open decision is said to be one and the issue is
   `question` + `ready-for-human` instead.

One problem per issue. Triage it on the way out
([triage-labels.md](./triage-labels.md)) or leave `needs-triage` on it. PRDs and
their sub-issues keep their own templates
([workflows.md](./workflows.md#prd-workflow)).

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
  a PR body carries `Closes #N` (see [pull-requests.md](./pull-requests.md)) and GitHub closes
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

**No `wontfix` label.** It was retired in #1116: the decision it recorded is made
by closing, and `stateReason` plus the `Closure:` comment carry it. Issues closed
before then may still mention it in their history.

### Reading a closed issue

**Do not infer from `CLOSED` that anything was built.** Issues closed before this
convention landed — that is, before [#722](https://github.com/leomontigatti/en-escena/pull/722),
merged in August 2026, so check `closedAt` — all carry `stateReason: COMPLETED`
regardless of outcome, so for those the field carries no information at all.
Check the code, or the closing discussion, before repeating the claim anywhere
durable.

The converse holds for PRD sub-issues: **an open sub-issue may already be
implemented.** A session implements the sub-issues onto one shared branch and
leaves each open, marking it with an `Implemented in <sha>` comment (the retired
`agent-implement-prd.yml` did the same); the PR closes the whole chain on merge.
Open therefore means "not on `master` yet", which is the honest reading.

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

## Ticket operations

The `to-spec` and `to-tickets` skills (vendored, `.agents/skills/`) ask for this section: where
the spec lives and how this tracker expresses tickets and their blocking edges. The rest of the
repo's deltas are in [workflows.md](./workflows.md#prd-workflow).

- **The PRD** is an issue in this repo: `gh issue create --title "..." --body-file <file>
--label ready-for-agent --label priority:<p> --label <type>`, body per the `to-spec` template.
- **Tickets** are native sub-issues of the PRD, created in implementation order:
  `gh issue create --parent <PRD> ...`, with the PRD's priority, type and milestone plus
  `ready-for-agent` ([triage-labels.md](./triage-labels.md)). No `agent:*` label: one session
  works them in order, so `agent:queued` does not apply.
- **Blocking** is GitHub's native dependency relation:
  `gh issue edit <ticket> --add-blocked-by <other>`, never only a "Blocked by #N" line in the
  body. The template's `## Blocked by` section still lists the same issues for the reader.
- **Test seams**: every ticket carries a `## Test seams` section after `## Acceptance
criteria`, taken from the PRD's **Testing Decisions** (see [Test seams](#test-seams)).
- **Do not close or edit the PRD**, as the skill says; the PRD PR closes it on merge.

## Wayfinding operations

The `wayfinder` skill (vendored, `.agents/skills/wayfinder`) asks for this section: how
_this_ tracker expresses the map, its tickets, blocking and the frontier, and what shape
the destination takes when the map is reached.

- **The map** is an issue labelled `wayfinder:map`. **Tickets** are native sub-issues of it:
  `gh issue create --parent <map> --label wayfinder:<type> ...`.
- **Blocking** is GitHub's native dependency relation:
  `gh issue edit <ticket> --add-blocked-by <other>`. Never a "Blocked by #N" line in the
  body; `agent-promote-queued.yml` reads only the native relation.
- **The frontier** is the open, unassigned, unblocked children. List the children with
  `gh issue view <map> --json subIssues`, keep the open ones, then drop any whose
  `gh issue view <n> --json assignees,blockedBy` shows an assignee or a blocker still `OPEN`.
- **Claiming** is `gh issue edit <ticket> --add-assignee @me`, before any work.

### Research tickets

The skill says a research ticket is "resolved by a subagent that calls the Skill tool with
`research`". Here that subagent is the **`research` agent** (`.claude/agents/research.md`): spawn
it with `subagent_type: "research"` and the ticket's question, one per research ticket, in
parallel. Its definition carries the rules (primary sources with a URL beside every claim,
firecrawl or `curl` for fetching, a tool-call budget, a fixed report shape), and the `research`
skill is not vendored.

The agent reports back as text and leaves git and the tracker alone, so the session that spawned
it does the capture: post the findings on the ticket as its resolution, and only when they are a
durable primary source worth keeping, name a `docs/research/<kebab-name>.md` path in the brief
and commit that file on the session's own branch. There is no throwaway `research/<name>` branch.

### Test seams

A ticket that settles how something is built records its **test seams** (the public interfaces
the behaviour will be tested through) in its resolution, and the map gists them under
Decisions-so-far. They land in the exit PRD's **Testing Decisions**
([PRD workflow](./workflows.md#prd-workflow)), which is where `to-tickets` and the
implementing session read them: the `tdd` skill tests only at seams agreed up front, and a
grilling session is the last point where a human can agree them.

### Exit shapes

Close the map by choosing how the destination is filed. The choice decides how many PRs
the work costs, and every PR pays a review, a babysitting pass, an update-branch and a
merge, while a PRD pays one of each for the whole chain. Measured on this repo when the AFK
runners still implemented: the seminars PRD #875 ran five sub-issues in under an hour onto
one PR; the guardrails map #929 filed eleven blocked standalone issues and paid eleven
review-and-merge cycles for the same serial order.

| Shape                                    | Use when                                                                                                                                                                         | Cost                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **One PRD with flat sub-issues**         | The slices are sequential, touch the same files, or none would be merged or reverted alone. **The default.**                                                                     | N slices in one session, one review, one merge.  |
| **Independent, unblocked issues**        | Each slice can merge and revert alone, and reviewing them in parallel is wanted.                                                                                                 | N of everything, in parallel.                    |
| **A chain of blocked standalone issues** | Only when a later issue must observe merged `master` (a docs pass describing gates that have to exist first). Then it is a PRD for the code plus **one** trailing blocked issue. | N of everything, serialised: the shape to avoid. |

A large map may cut into two or three PRDs by theme, chained by blockers between the PRDs,
when one diff would be too big to review well. The PRD is written per the
[PRD workflow](./workflows.md#prd-workflow) and sliced with `to-tickets` per
[Ticket operations](#ticket-operations); the sub-issues stay flat.

### Driving what the map produced

A session implements the PRD's sub-issues in list order onto one branch, or a chain of
standalone issues one PR at a time. Either way, the map issue is the durable state: post a
two-line "State" comment on it at each merge (what landed, what is next and its label) so a
fresh session, on any machine, starts from the record instead of from a summary.
