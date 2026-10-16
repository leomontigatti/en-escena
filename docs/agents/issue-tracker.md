# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.
Do not use GitHub connector/MCP app tools for this repo. The local `gh` auth is
the source of truth for issue and pull request operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. When creating implementation issues from a PRD issue, use `--parent <PRD_NUMBER>` so GitHub records them as native sub-issues.
- **Read an issue**: `gh issue view <number>` for the body, then `gh issue view <number> --comments`; outside a terminal `--comments` prints the comments alone, so it never stands in for the first. Filter comments by `jq` and fetch the labels too. For a **closed** issue read the outcome too — `gh issue view <number> --json number,title,state,stateReason,closedAt,labels,comments`; neither the plain-text view nor `gh issue list` prints `stateReason`, and with `--json` every field is opt-in, so it is invisible unless asked for. See [Reading a closed issue](#reading-a-closed-issue).
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
([Labels](#labels)) or leave `needs-triage` on it. PRDs and
their sub-issues keep their own templates
([PRD workflow](#prd-workflow)).

## Labels

The list of labels (name, colour, description) is [`.github/labels.json`](../../.github/labels.json);
this section says what they mean. Add or change a label in the JSON, run `pnpm labels:sync`, then
describe it here; `pnpm check:labels` fails CI when a workflow or script names a label the file
does not hold ([scripts](../operations/scripts.md#validation)).

The shared skills speak of a few triage roles; each maps to a label here:

| Role                      | Label                          | Meaning                                                                               |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| needs triage              | `needs-triage`                 | Maintainer needs to evaluate this issue                                               |
| needs information         | `question` + `ready-for-human` | Not specified enough to act on; a person has to decide first                          |
| work an agent may pick up | `ready-for-agent`              | Fully specified and grabbable: a triage state, **not** a trigger                      |
| work for a human          | `ready-for-human`              | Needs a human: a decision to settle or work an agent cannot do                        |
| will not be done          | none: close it                 | Close `not planned` with a `Closure:` comment ([Closing an issue](#closing-an-issue)) |

`needs-info` and `wontfix` were retired. With one maintainer there is no reporter to wait on, so
"needs more information" is a decision the maintainer owes, which is what `question` +
`ready-for-human` already say. And a decision not to do something is made by closing: an open
issue labelled "will not be actioned" is a closure that did not happen.

### Priority and type

The roles above say whether an issue can be picked up. They do not say how much it matters.
Triage also gives every issue exactly one priority label and at least one type label, and removes
`needs-triage` on the way out. An issue with no `priority:*` label has not been triaged.

| Priority label    | Meaning                                                                       | Test                                   |
| ----------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| `priority:urgent` | Breaks money, data or the live event, or the next event cannot run without it | Would I drop what I am doing for this? |
| `priority:next`   | The short list to pull from next. Keep it to about 15                         | Will I start this within two weeks?    |
| `priority:later`  | Worth doing, no blocker, not scheduled                                        | Would I be sad to close it?            |
| `priority:parked` | Deliberately not now, and the issue names what wakes it                       | Is there a condition that reopens it?  |

`priority:urgent` is empty outside the run-up to an event. Dated work also goes in a milestone
("Before the next event"), which is what carries the deadline; the label only says it comes
first. A parked issue carries a comment stating its wake-up trigger ("the first slice of the
list-query work lands"); without one it is `priority:later`. Deciding against is a different
thing: parked will be done when the trigger fires, a rejected issue is closed.

| Type label    | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `bug`         | Wrong behaviour today                                                     |
| `enhancement` | New capability or UX                                                      |
| `refactor`    | Internal structure, no behaviour change                                   |
| `chore`       | Dependencies, tooling, CI, docs or operations                             |
| `question`    | A decision to settle rather than work to do; pairs with `ready-for-human` |

An Architecture Review PRD that documents a confirmed defect carries `bug` next to `refactor`.
When the defect is cheap and the PRD is large, extract the defect into its own `bug` issue so it
can ship alone.

### The dispatch queue

The queue is `priority:next` plus `ready-for-agent`:
`gh issue list --label priority:next --label ready-for-agent`. Skip an issue whose
`gh issue view <n> --json blockedBy` still lists an open blocker: blocking is GitHub's native
relation ([Ticket operations](#ticket-operations)), and no label tracks it.

Sub-issues are not triaged on their own. `to-tickets` creates each slice with its PRD's priority,
type and milestone ([Ticket operations](#ticket-operations)). That multiplies a PRD in any
priority list, so add `no:parent-issue` for the PRD-level view:
`gh issue list --label priority:next --search "no:parent-issue"`.

> **`ready-for-agent` triggers nothing.** It is a triage state ("specified and grabbable"): a
> local session picks the issue up from the dispatch queue above (ADR-0016). No label starts a
> run: Architecture Review, the one unattended run left, is a T3 Code scheduled task
> ([architecture-review.md](architecture-review.md)).

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
  re-point anything blocked on this issue at the follow-up
  (`gh issue edit <dependent> --add-blocked-by <follow-up>`): GitHub counts a
  closed blocker as cleared however it closed, so a dependent left pointing at
  the deferred issue reads as unblocked when it is not. Only the person closing
  can declare the follow-up as the new blocker.

Everything is one command, so there is nothing to remember beyond the flag:

```sh
gh issue close 712 --reason "not planned" \
  --comment "Closure: deferred to #715 — the threshold rewrite lands there."
```

**No `wontfix` label**: the decision is made by closing, and `stateReason` plus the
`Closure:` comment carry it. Older issues may still mention the label.

### Reading a closed issue

**Do not infer from `CLOSED` that anything was built.** Issues closed before
2026-08-14 (check `closedAt`) all carry `stateReason: COMPLETED` regardless of
outcome, so for those the field carries no information at all. Check the code, or
the closing discussion, before repeating the claim anywhere durable.

The converse holds for PRD sub-issues: **an open sub-issue may already be
implemented.** A session implements the sub-issues onto one shared branch and
leaves each open, marking it with an `Implemented in <sha>` comment (the retired
`agent-implement-prd.yml` did the same); the PR closes the whole chain on merge.
Open therefore means "not on `master` yet", which is the honest reading.

This is not hypothetical: ADR-0011 and ADR-0014 were both written claiming a
`COMPLETED` issue had deleted `porcion` when every symbol they named was still
live, and other issues closed the same way with nothing built. ADRs are
append-only, so an error in one stands until someone appends a correction;
ADR-0011's is still pending.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number>` for the body and `gh issue view <number> --comments` for the
comments. Outside a terminal `--comments` prints only the comments, and an issue whose body is
the spec is then read from its comments alone.

## Ticket operations

The shared `to-spec` and `to-tickets` skills ask for this section: where
the spec lives and how this tracker expresses tickets and their blocking edges. Both are
user-invoked (`disable-model-invocation`): a session asks the user to run `/to-spec` or
`/to-tickets <PRD>` rather than calling the Skill tool.

- **The PRD** is an issue in this repo: `gh issue create --title "..." --body-file <file>
--label ready-for-agent --label priority:<p> --label <type>`, body per the `to-spec` template.
- **Tickets** are native sub-issues of the PRD, flat, and created in the order a session
  will implement them: `gh issue create --parent <PRD> ...`, with the PRD's priority, type
  and milestone plus `ready-for-agent` ([Labels](#labels)). Check first
  that the PRD has none yet (`gh issue view <PRD> --json subIssues,subIssuesSummary`), and
  publish no slice before the user approves the slicing in `to-tickets`' quiz. One session
  works them with `/implement-spec`, every unblocked one at once, onto one PR
  ([pull-requests.md](./pull-requests.md#prd-prs)).
- **Blocking** is GitHub's native dependency relation:
  `gh issue edit <ticket> --add-blocked-by <other>`, never only a "Blocked by #N" line in the
  body. The template's `## Blocked by` section still lists the same issues for the reader.
- **Two slices that each add a migration** get a blocking edge between them: run in parallel
  they would take the same migration number. `implement-spec` serialises them even when the
  edge is missing.
- **Test seams**: every ticket carries a `## Test seams` section after `## Acceptance
criteria`, taken from the PRD's **Testing Decisions** (see [Test seams](#test-seams)); the
  skill's template lacks it.
- **Do not close or edit the PRD**, as the skill says; the PRD PR closes it on merge.
- **A model file must follow the guide.** A PRD or ticket that names an existing file as the
  shape to follow ("build it like `preset-dialog.tsx`") names one that conforms to
  [style-guide.md](./style-guide.md) and [coding-standards.md](./coding-standards.md). A
  nonconforming file is never the model, however close its shape: the implementer copies it, and
  the review then reads the copy as the spec asking for it.

## PRD workflow

A PRD is written with `/to-spec`, which carries the process and the template; what it does
not know about this repo:

- The PRD is filed per [Ticket operations](#ticket-operations).
- **Testing Decisions names the test seams**: the public interfaces the behaviour is tested
  through (a service function, a route's loader or action, a pure state module). The `tdd` skill
  tests only at seams agreed up front, and this session is the last point where a human agrees
  them, so the skill's "check with the user that these seams match" step is not skippable.
- Labels: `ready-for-agent` as the skill says, which here is a triage state and triggers nothing
  ([Labels](#labels)), plus one `priority:*` and a type label. Ask the
  priority together with the seams when the conversation has not settled it. No `agent:*` label.

## Wayfinding operations

The shared `wayfinder` skill asks for this section: how
_this_ tracker expresses the map, its tickets, blocking and the frontier, and what shape
the destination takes when the map is reached.

- **The map** is an issue labelled `wayfinder:map`. **Tickets** are native sub-issues of it:
  `gh issue create --parent <map> --label wayfinder:<type> ...`.
- **Blocking** is GitHub's native dependency relation:
  `gh issue edit <ticket> --add-blocked-by <other>`. Never a "Blocked by #N" line in the
  body; the frontier below reads only the native relation.
- **The frontier** is the open, unassigned, unblocked children. List the children with
  `gh issue view <map> --json subIssues`, keep the open ones, then drop any whose
  `gh issue view <n> --json assignees,blockedBy` shows an assignee or a blocker still `OPEN`.
  The blockers are under `.blockedBy.nodes[]`, each with `.number` and `.state`:
  `--jq '[.blockedBy.nodes[] | select(.state == "OPEN") | .number]'`.
- **Claiming** is `gh issue edit <ticket> --add-assignee @me`, before any work.

A research ticket is resolved as [Research tickets](#research-tickets) says.

### Test seams

A ticket that settles how something is built records its **test seams** (the public interfaces
the behaviour will be tested through) in its resolution, and the map gists them under
Decisions-so-far. They land in the exit PRD's **Testing Decisions**
([PRD workflow](#prd-workflow)), which is where `to-tickets` and the
implementing session read them: the `tdd` skill tests only at seams agreed up front, and a
grilling session is the last point where a human can agree them.

### Exit shapes

Close the map by choosing how the destination is filed. The choice decides how many PRs
the work costs, and every PR pays a review, a babysitting pass, a branch update and a
merge, while a PRD pays one of each for the whole chain. Measured on this repo: a PRD ran five
sub-issues in under an hour onto one PR, while a map filed as eleven blocked standalone issues
paid eleven review-and-merge cycles for the same serial order.

| Shape                                    | Use when                                                                                                                                                                         | Cost                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **One PRD with flat sub-issues**         | The slices are sequential, touch the same files, or none would be merged or reverted alone. **The default.**                                                                     | N slices in one session, one review, one merge.  |
| **Independent, unblocked issues**        | Each slice can merge and revert alone, and reviewing them in parallel is wanted.                                                                                                 | N of everything, in parallel.                    |
| **A chain of blocked standalone issues** | Only when a later issue must observe merged `master` (a docs pass describing gates that have to exist first). Then it is a PRD for the code plus **one** trailing blocked issue. | N of everything, serialised: the shape to avoid. |

A large map may cut into two or three PRDs by theme, chained by blockers between the PRDs,
when one diff would be too big to review well. The PRD is written per the
[PRD workflow](#prd-workflow) and sliced with `to-tickets` per
[Ticket operations](#ticket-operations); the sub-issues stay flat.

### Driving what the map produced

A session implements the PRD's sub-issues with `/implement-spec` onto one branch, or a chain of
standalone issues one PR at a time. Either way, the map issue is the durable state: post a
two-line "State" comment on it at each merge (what landed, what is next and its label) so a
fresh session, on any machine, starts from the record instead of from a summary.

## Research tickets

A research ticket is resolved by the shared **`research` agent**: spawn it with the ticket's
question, one per research ticket, in parallel, in the Research role of the shared
`agents/models.md`. Its brief carries the rules (primary sources with a URL beside every claim,
a tool-call budget, a fixed report shape), and [research.md](research.md) names the sources this
stack prefers; there is no `research` skill.

The agent reports back as text and leaves git and the tracker alone, so the session that spawned
it does the capture: post the findings on the ticket as its resolution, and only when they are a
durable primary source worth keeping, name a `docs/research/<kebab-name>.md` path in the brief
and commit that file on the session's own branch. There is no throwaway `research/<name>` branch.
