# Pull requests

What the shared `pr` and `babysit-pr` skills need to know about this repo. The body (Summary,
Evidence, Merge Danger, `## Review`, `Closes #N`), the title rule and stacking are the shared
`pr` skill's; `.github/pull_request_template.md` is the same template for a PR opened by hand.

## Title

PRs are squash-merged, so the title is the commit subject. `pnpm check:pr-title "<title>"` checks
it (a Conventional Commit with an English subject); CI runs it from `pr-title.yml`, a required
context on `master` ([ci.md](../operations/ci.md#required-contexts)). Run it before
`gh pr create`.

## Base branch

- The default branch is `master`. Branch protection requires `checks`, `db-gate`, `docs-gate`,
  `actions-gate`, `pr-title` and `review-record`, with `strict: true`: the branch must be up to
  date with `master`, and nothing updates it on its own. The babysit does it once, when being
  behind is all that is left (`gh pr update-branch`, or a local merge when it conflicts). A PR
  nobody is babysitting is updated the same way by hand.
- `db-gate` runs after the `db-shard` matrix, so it is missing from a fresh push's checks for
  about four minutes: read the required list from branch protection, not from the rollup.
- A stack is linked with `gh stack` so CI evaluates every layer as if it targeted `master`
  ([ci.md](../operations/ci.md#stacked-prs)). Babysit once the whole stack is open: a babysit per
  layer spends checks on commits the next layer's push restarts. After a stack's bottom layer
  merges, the next layer is behind: babysit it again.

## PRD PRs

One PR carries every sub-issue of a PRD, with the body the `pr` skill describes. It is the one PR
opened as a **draft**: the `implement-spec` skill opens it after the first slice merges and marks
it ready when the last has landed and the chain has been reviewed, then babysits it. The
`review-record` check skips drafts, and so does CodeRabbit (`auto_review.drafts` defaults to off),
so the chain pays one review instead of one per slice.

## Evidence

Before and after images, recordings and their upload with `pnpm pr:evidence` are
[verification.md](verification.md#evidence)'s.

## Review bot

CodeRabbit, configured by `.coderabbit.yaml`, which is read from the PR's head branch; its
`base_branches` entry is what lets a PR stacked on a non-master branch be reviewed at all.

- **When to ask.** Only on a PR in the `full` tier ([review.md](review.md#full-review)), once the
  PR is final: `gh pr comment <n> --body "@coderabbitai review"`, once on the head the PR was
  opened with. A push made before it has reviewed cancels the review: it edits its reply to the
  request into "Action not completed" with "Pull request base or head changed". Then ask once
  more, on the new head. No other PR asks it, and none waits on it. While the repo has under 10
  GitHub stars it gives no automatic reviews and each request spends a small hourly allowance,
  so a rate limit ("Review limit reached") or a skipped review is never a reason to wait: report
  CodeRabbit as `skipped`, with the reason.
- **Its login** starts with `coderabbitai`; that is the `<bot login>` of the babysit's commands.
- **How to read it.** It reports through its `CodeRabbit` commit status: a red status is it
  declining to review, not a check to triage. A pass is a review it posted on the PR; a pass that
  finds nothing posts no review, only its summary comment, which names the commit it covered. A
  review's body findings sit in its "Prompt to fix review comments" block, outside the "Inline
  comments" section, which repeats the threads. It edits its replies in place, so read the
  current body of its latest comment.
- **What it knows.** It reads the diff and `docs/agents/coding-standards.md`, not the issue or the
  domain: check each claim against the code before acting on it. A finding backed by
  [coding-standards.md](coding-standards.md) or [style-guide.md](style-guide.md) is never declined
  on the triager's judgement alone.
- **Whether it stays** is what the two-family trial decides ([review.md](review.md#full-review)):
  the in-session correctness axis took over the job it did on every PR.
