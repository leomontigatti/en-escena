---
name: review-triage
description: "Triage an AFK-reviewed PR's conversation into a brief for the implementer, agreeing the open decisions with you first."
disable-model-invocation: true
---

# Review triage

Turn the conversation on a reviewed PR into a clean brief, then hand it to the AFK
implementer. Argument: a PR number. Without one, ask which PR.

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
**settle** (or ignore, on a surface that can't be resolved).

## Writing a brief

The implementer reads your reply with no spec in hand and only a `--stat` summary of the diff.
Write for that reader: imperative, self-contained, naming the path and the change.

> Rename `dancerDiscountAmount` to `discountAmount` in `app/lib/finances/totals.server.ts` and
> its two call sites. Leave the DB column alone — the migration is #903's job.

State declines as decisions too ("Leave as is: the guard is unreachable because the loader
already 404s on a missing seminar"), so the implementer doesn't re-open it.

## Phase 1 — Read

Preflight: the PR is open, and carries neither `agent:in-progress` (a run holds the lock — wait)
nor `agent:review` (a review is pending — wait).

Fetch all three surfaces, read the diff for every path a thread hangs off, and build a ledger of
every item. Done when every unresolved thread, every top-level comment and every review summary
sits in the ledger with a verb against it.

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
4. `gh pr edit <n> --add-label "agent:implement"`.

Then tell the user what went where, and that the label is consumed by the run — re-add it for
the next round.

Once the implementer has pushed, the briefed threads are yours to resolve; leaving them
unresolved feeds them back into the next run.

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
