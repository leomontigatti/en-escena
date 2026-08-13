# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.
Do not use GitHub connector/MCP app tools for this repo. The local `gh` auth is
the source of truth for issue and pull request operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. When creating implementation issues from a PRD issue, use `--parent <PRD_NUMBER>` so GitHub records them as native sub-issues.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --reason <completed|"not planned"> --comment "Closure: ..."` — see [Closing an issue](#closing-an-issue) for the reason and the comment.

Infer the repo from `git remote -v` - `gh` does this automatically when run inside a clone.

## Closing an issue

Closing means **a decision was made**. It does not mean the code changed. Four
outcomes close an issue, and the closure has to say which one:

| Outcome             | Meaning                                                         | `--reason`    | First line of the closing comment  |
| ------------------- | --------------------------------------------------------------- | ------------- | ---------------------------------- |
| **Built**           | The decision is in the code on `master`.                        | `completed`   | `Closure: built — <PR or commit>`  |
| **Deferred**        | The decision stands; the work moved to a named follow-up issue. | `not planned` | `Closure: deferred to #<number>`   |
| **Decided against** | Considered and rejected.                                        | `not planned` | `Closure: decided against — <why>` |
| **Out of scope**    | Not this repository's problem, or not a problem.                | `not planned` | `Closure: out of scope — <why>`    |

Rules:

- **Only "built" closes as `completed`.** The other three are `not planned`.
  That is the whole point: `stateReason` is the one field every `gh issue view`
  and `gh issue list --json` already returns, so it is what a reader sees before
  reading anything else. An issue that closes `COMPLETED` claims the code
  changed.
- **"Built" means verified on `master`,** not that a PR exists or a plan was
  agreed. If you cannot point at the merged change, the outcome is one of the
  other three.
- **A deferral must name its follow-up issue.** `deferred to #712` is a
  deferral; "deferred" alone is indistinguishable from work that was done. Open
  the follow-up first, then close.
- **Write the comment even when the reason seems obvious.** `--reason` has four
  outcomes to carry and only two values; the comment is what separates deferred
  from rejected from out of scope.

Everything is one command, so there is nothing to remember beyond the flag:

```sh
gh issue close 712 --reason "not planned" \
  --comment "Closure: deferred to #715 — the threshold rewrite lands there."
```

### Reading a closed issue

**Do not infer from `CLOSED` that anything was built.** Issues closed before
this convention landed all carry `stateReason: COMPLETED` regardless of outcome,
so for those the field carries no information at all — check the code, or the
closing discussion, before repeating the claim anywhere durable.

This is not hypothetical. `docs/adr/0011-…` and `docs/adr/0014-…` both state that
[#554](https://github.com/leomontigatti/en-escena/issues/554) deleted `porcion`
"outright — column, pgEnum, `derivePorcion`, `formatComprobantePorcionLabel` and
every reader". All of those still exist; `porcion` is a `NOT NULL` enum column
that is derived at emission and printed on the invoice. The issue was closed
`COMPLETED` and read as done.
[#621](https://github.com/leomontigatti/en-escena/issues/621) ("what holds the
`NOT NULL` `selectedPriceId`") closed the same way, and `selectedPriceId` is
nullable, written only by later updates and never by a creation path.
[#650](https://github.com/leomontigatti/en-escena/issues/650) ("Refunds") closed
the same way, and there is no refund table. ADRs are append-only, so the error in
them is permanent until someone appends a correction.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
