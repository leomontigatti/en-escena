# Pull requests

What the shared `pr` and `babysit-pr` skills need to know about this repo. The body (what the
user must do, one to three sentences, an optional `**Door: one-way.**` line, `## Review`,
`Closes #N`), the title rule and stacking are the shared `pr` skill's;
`.github/pull_request_template.md` is the same template for a PR opened by hand. A PR carries no
images: screens are approved in the thread ([verification.md](verification.md#evidence)).

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
`review-record` check skips drafts, so the chain pays one review instead of one per slice.
