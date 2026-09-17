---
name: review-triage
description: "Triage an AFK-reviewed PR's conversation into a brief for the implementer, agreeing the open decisions with you first, then land the PR and carry a chain of AFK issues to the next one."
disable-model-invocation: true
---

# Review triage

Turn the conversation on a reviewed PR into a clean brief, hand it to the AFK implementer,
and land the PR once the briefs are honoured. Argument: a PR number, or a map issue number
when driving a chain (see [Driving a chain](#driving-a-chain)). Without one, ask which.

You decide and you write comments. You never edit code — `agent:implement` does that.

## The inbox

**Unresolved review threads are the implementer's inbox.** Implement PR builds its prompt
from exactly three surfaces (`.sandcastle/agent-review/context.mts`):

- **unresolved threads** — the whole thread, each comment tagged with its author. Resolved
  threads are filtered out before the prompt exists, so a resolved thread is invisible: the
  question _and_ your answer to it both vanish.
- **top-level PR comments** — all of them, ever. No resolution state.
- **review summaries** — every non-empty submitted review body, ever. No resolution state.

Resolution is the only scoping lever you have. Everything below is about spending it well.

## The three verbs

Every item gets exactly one.

**settle** — nothing left for the implementer. The reviewer reported a fix it already
committed, or left context, praise, or an aside. Confirm a claimed fix is really in the branch
(`git log`, `git diff master...HEAD -- <path>`) before settling on the reviewer's word.
→ resolve the thread, silently.

**brief** — actionable, and the call is yours to make from the code and the repo's standards.
→ reply with the decision, leave it unresolved.

**ask** — actionable, and the call is the user's: a product or domain question, a trade-off with
no dominant answer, or anything touching money, `comprobante` emission, or destructive data
paths. → take it to the user, then it becomes a **brief** carrying their answer.

Bot noise is not feedback: `agent:*` run-failed and "ignored: nothing to act on" comments are
**settle** (or ignore, on a surface that can't be resolved). [Settle patterns](#settle-patterns)
lists the shapes seen more than once.

## Writing a brief

The implementer reads your reply with no spec in hand and only a `--stat` summary of the diff.
Write for that reader: imperative, self-contained, naming the path and the change.

> Rename `dancerDiscountAmount` to `discountAmount` in `app/lib/finances/totals.server.ts` and
> its two call sites. Leave the DB column alone — the migration is #903's job.

State declines as decisions too ("Leave as is: the guard is unreachable because the loader
already 404s on a missing seminar"), so the implementer doesn't re-open it.

## Phase 1 — Read

Preflight: the PR is open, and carries neither `agent:in-progress` (a run holds the lock — wait)
nor `agent:review` (a review is pending — wait). To wait without polling by hand, run the
watcher in the background and act when it returns:

```bash
pnpm afk:watch pr <PR> --until review
```

The review's outcome label says how much of this skill applies. `agent:needs-decision` is the
normal case: a call is the human's, run every phase. `agent:ready` means the posted review left
zero unresolved threads and no spec finding: skip to [Phase 4](#phase-4--land). Until #1021
makes Review apply them, apply the right one yourself after Phase 1, so the PR list reads the
same either way.

Fetch all three surfaces, read the diff for every path a thread hangs off, and build a ledger of
every item. Done when every unresolved thread, every top-level comment and every review summary
sits in the ledger with a verb against it.

Read cheaply: `gh pr diff <PR> --stat` first, then only the files a thread hangs off. Trim the
thread query with `jq` to the last comment per thread plus its path on a first pass. Spawn no
subagent for triage; the surfaces are small once trimmed.

## Phase 2 — Agree

Show the user the ledger: the settles and briefs as a compact list (one line each, drafted reply
included for briefs), then the asks.

Put each ask to them with `AskUserQuestion` — batch up to four, **recommended option first,
labelled `(Recommended)`**, and each option describing its consequence. When an ask only makes
sense against code, show the snippet or a worked example in prose first, then ask. When it has
no options to pick between, ask it in prose.

Carry their answers into the briefs, and show any brief you rewrote. Phase 2 is done when every
item carries a verb and every ask carries the user's answer.

**No GitHub writes happen before that point.** Reading is free; a posted comment is not.

## Phase 3 — Write

In order:

1. Reply to each **brief** thread. Leave it unresolved.
2. Resolve each **settle** thread.
3. Post one top-level comment briefing anything that came from a top-level comment or a review
   summary — those surfaces have no threads to reply into.
4. `gh pr edit <n> --add-label "agent:implement" --remove-label "agent:needs-decision"`: the
   decision has been made, so the cue comes off with the same edit.

Then tell the user what went where, and that the label is consumed by the run — re-add it for
the next round.

If the ledger held no brief, skip to [Phase 4](#phase-4--land): there is nothing to implement.

## Phase 4 — Land

The half after the briefs. Landing is a local, user-authorised act: nothing on Actions merges
(spec §3.9), and this phase is the human's seat, so the user's standing instruction to merge
("take the wheel", "merge it yourself when green") is what authorises step 4 below. Without it,
stop after step 3 and report.

1. **Wait for the implementer.** `pnpm afk:watch pr <PR> --until implement` in the
   background. It returns when the run's labels are gone and the head or the comments moved;
   `blocked` means the run failed, so read the run-failed comment before re-adding the label.
2. **Verify the push against the briefs.** `gh pr diff <PR> --stat`, then each briefed path.
   A brief the diff does not honour goes back to Phase 1 as a new item; one it honours is
   yours to resolve now. An unresolved briefed thread feeds itself into the next run.
3. **Anything new?** A run may reply with a question or add a comment. New items go through
   Phases 1 to 3 again. When every surface is settled or answered, land.
4. **Land.** Arming is the session's act on the user's standing instruction; no workflow
   merges (spec §3.9). Once the repo allows auto-merge (#1022), arm it and stop waiting:

   ```bash
   gh pr merge <PR> --squash --auto --delete-branch
   ```

   GitHub merges when the four contexts are green and the branch is up to date; a branch that
   falls behind gets `agent:update-branch` from the push-to-master trigger (#1020). Until
   #1022, the path is manual and the session waits:

   ```bash
   pnpm afk:watch pr <PR> --until checks   # background; returns checks-green or checks-red
   gh pr merge <PR> --squash --delete-branch
   ```

   **Do not run `gh pr update-branch` yourself** (#1020). The push to `master` already labelled
   every behind `agent/*` PR, and Update Branch's push is a `--force-with-lease` against the head
   it checked out: a manual update moves that head under the run, the push is rejected and the PR
   flips to `agent:blocked`. When the PR is behind, read its labels — `agent:update-branch` or
   `agent:in-progress` means the run has it, so wait (`pnpm afk:watch pr <PR> --until implement`
   fires on the merge commit it pushes). Only a PR that is behind with **neither** label is yours
   to update by hand, and that means the trigger missed it: say so.

   GitHub reports "Head branch is out of date" for a minute or two after an update while it
   recomputes; retry the merge, do not update again. `checks-red` means read the failing job,
   then brief or ask; never retry a red job blind. If a commit subject or the PR body is in
   Spanish, pass an English `--body-file` to the squash merge (#1016 tracks fixing the prompts).

5. **Confirm the hand-off.** A merged `Closes #N` closes the issue and fires Promote Queued.
   Check the next issue in the chain moved: `gh issue view <next> --json labels`. It should
   carry `agent:implement`, or `agent:in-progress` if the run already started.

## Driving a chain

A wayfinder map that exited as blocked standalone issues (the shape to avoid, per the tracker
doc's [Wayfinding operations](../../../docs/agents/issue-tracker.md#wayfinding-operations))
produces one PR per issue, each needing this skill once. Driving the chain is this skill in a
loop, with these rules:

- **State the predicate first.** "Every issue in the chain merged and closed, the next one
  promoted" is checkable; "keep an eye on it" is not. The loop ends when the predicate holds.
- **Start from the record, not from scratch.** On pickup, read the handoff file if there is
  one, then reconstruct state from labels (`gh issue list --label agent:queued`,
  `--label agent:blocked`, `gh pr list --label agent:in-progress`) and the last "State"
  comment on the map issue. The record is authoritative: redo nothing it says was done.
- **Decisions already made stay made.** The map issue's "Standing preferences" and any
  "Decisions already made" block in the handoff are standing orders. Re-read them at each
  merge, and never reopen one because a reviewer argued for it.
- **One turn per event.** Every wait is a background watcher call, never a hand-rolled poll.
  Ignore workflow runs entirely; labels, reviews and checks carry the state.
- **Reset at each merge.** Post a two-line "State" comment on the map issue: what merged,
  what is next and its label. If the context is large, that comment is where a fresh thread
  starts; the `handoff` skill writes the longer note when one is needed.
- **One PR at a time.** Promote Queued serialises the chain; do not label two issues
  `agent:implement` to save time, since their PRs would conflict on the same files.

An issue whose run failed on the usage limit rather than on the work is retried by swapping
`agent:blocked` for `agent:implement`; the retry branches fresh from `master`.

## Settle patterns

Shapes that were `settle` on more than one PR. Add one when you see it twice; a pattern that
starts to catch real findings gets deleted, not softened.

- **Reviewer-fixed claims.** An inline comment saying the reviewer already fixed the thing.
  Confirm with `git log master..HEAD --oneline -- <path>` or the branch diff, then resolve.
  Do not settle on the comment alone: the fix has to be on the branch.
- **Bot run comments.** `agent:*` run-failed, "ignored: nothing to act on", "ignored: the PR
  body links no issue". Settle; the label state, not the comment, is what to act on.
- **Standards notes the reviewer declined from the code.** When the reviewer's decline is
  argued from the code and matches the repo's standards, accept it and settle; when it is
  argued from taste, brief the standard.

## Commands

Fetch the threads — `databaseId` is not needed, every write below takes the thread node id:

```bash
gh api graphql -f query='
query($owner:String!,$repo:String!,$number:Int!){
  repository(owner:$owner,name:$repo){ pullRequest(number:$number){
    reviewThreads(first:100){ nodes{
      id isResolved isOutdated path
      comments(first:50){ nodes{ author{login} body line originalLine } } } } } }
}' -F owner=leomontigatti -F repo=en-escena -F number=<PR>
```

The other two surfaces:

```bash
gh pr view <PR> --json comments,labels,state,body
gh api repos/leomontigatti/en-escena/pulls/<PR>/reviews --jq '[.[]|select(.body!="")|{author:.user.login,body}]'
```

Reply in a thread, and resolve one. `@reply.md` passes the body from a file, so markdown with
backticks survives the shell:

```bash
gh api graphql -f query='mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){ comment{url} } }' \
  -F id=<THREAD_ID> -F body=@reply.md

gh api graphql -f query='mutation($id:ID!){
  resolveReviewThread(input:{threadId:$id}){ thread{isResolved} } }' -F id=<THREAD_ID>
```

`unresolveReviewThread` takes the same shape, for when you settle one too eagerly.

The watcher (`scripts/afk-watch.mjs`) prints one JSON line and exits when the event happens;
`event` is `review`, `implement`, `checks-green`, `checks-red`, `merged`, `closed`, `blocked`,
`pr`, `label:<name>` or `timeout`. Run it as a background command with a generous
`--timeout` and read the line when it returns.
