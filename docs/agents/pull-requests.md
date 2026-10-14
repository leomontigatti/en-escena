# Pull requests

How a PR is written here. The title rule is
enforced (`pnpm check:pr-title`, see [ci.md](../operations/ci.md#required-contexts));
everything below is convention. Branches and linking the PR to its T3 thread are
in [workflows.md](./workflows.md#branches-worktrees-and-t3-code-threads).

## Body

The body is written with the `pr` skill
([`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md)): the template (Summary,
Evidence, Merge Danger, `Closes #N`), the rules, the one-way doors of this repo and the shape of a
PRD PR's body all live there. `.github/pull_request_template.md` is the same template for a PR
opened by hand.

### PRD PRs

One PR carries every sub-issue of a PRD, with the body the `pr` skill describes. It is the one PR
opened as a **draft**: the `implement-spec` skill opens it after the first slice merges and marks
it ready when the last has landed and the chain has been reviewed, then babysits it. CodeRabbit
does not review drafts (`auto_review.drafts` defaults to off), so the chain pays one review
instead of one per slice.

## UI evidence

A PR that changes what a screen looks like carries before and after images. A
change to motion or interaction carries a short GIF instead.

- Capture against seed data, never a database refreshed from production:
  screenshots show names and payments. The screenshots come from the browser
  loop in [workflows.md](./workflows.md#ui-verification), run against what
  `pnpm db:seed` creates.
- Name the files `<what>-before.png` and `<what>-after.png`, then run
  `pnpm pr:evidence <pr> <files...>`. It uploads them to the `pr-assets`
  prerelease (`gh` has no attachment upload, and a release asset renders inline)
  and prints the markdown, pairs already laid out as a Before/After table. Paste
  it under `## Evidence`. Running it again with the same file names replaces the
  assets.
- Motion goes in as a short GIF through the same command. GitHub only gives its
  video player to files uploaded through the browser, so a real video is put in
  the session's final message as a path, and the human drags it into the PR.
- **The repository is public, and so is every asset.** Remove one with
  `gh release delete-asset pr-assets <name>`.
- Never commit PR-only evidence to the repo.

## Babysitting a PR

Seeing a PR through CI and review is the `babysit-pr` skill: the session that
opened the PR has T3 watch it (`watch_pull_request`; outside T3, a background
`gh pr checks --watch`), wakes when a round needs judgement, fixes the findings that hold, answers the rest with the
reason, and stops at ready to merge. The merge stays the user's.
In a stack, babysit once the whole stack is open: a babysit per layer spends
checks on commits the next layer's push restarts.

Branch protection requires a branch up to date with `master`, and nothing
updates it on its own: the babysit does it once, when being behind is all that
is left (`gh pr update-branch`, or a local merge when it conflicts). A PR nobody
is babysitting is updated the same way by hand. After a stack's bottom layer
merges, the next layer is behind: babysit it again.

CodeRabbit is optional. The in-session review carries its job: the correctness
axis of `implement` step 5 runs on every diff that changes behaviour, on Opus
beside the Sol axes, and its brief names the areas where CodeRabbit caught bugs
that review used to miss. CodeRabbit is asked once, by the babysit, and only on
a PR in the full-review tier, once the PR is final (and once more if a push of
the babysit's own cancels that review); no other PR waits on it. While the repo has under 10 GitHub stars,
CodeRabbit gives it no automatic reviews and each request spends a small hourly
allowance, so a rate limit or a skipped review is never a reason to wait: the
PR is ready once its checks are green and the in-session review ran, and the
babysit reports CodeRabbit as skipped.

When it does run, it is configured by `.coderabbit.yaml`, which is read from
the PR's head branch; its `base_branches` entry is what lets a PR stacked on a
non-master branch be reviewed at all. It reports through its `CodeRabbit`
commit status; a pass with no findings posts no review, only its summary
comment. `@coderabbitai review` asks for a pass. Its findings are verified
against the source like any other: it has the diff and the repo's standards,
not the issue or the domain.
