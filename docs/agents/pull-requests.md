# Pull requests

How a PR is written here. The title rule is
enforced (`pnpm check:pr-title`, see [workflows.md](./workflows.md#continuous-integration));
everything below is convention. Branches and linking the PR to its T3 thread are
in [workflows.md](./workflows.md#branches-worktrees-and-t3-code-threads).

## Body

PRs are squash-merged: the title becomes the commit subject, and the issue is
the record of why. The body is for the reviewer, who has the diff open. Write
it in this shape and stop:

1. **The problem**, in one or two sentences. What was wrong or missing, as the
   user or the maintainer would see it.
2. **The fix**, in a short paragraph or a few bullets. What changed and, when it
   is not obvious from the diff, why this way. Name a symbol or a file only when
   the reviewer would not find it alone.
3. **`Risk:`** one line: whether the merge is a **two-way door** (a revert takes
   it back) or a **one-way door** (something a revert does not undo), and the
   **blast radius**: what breaks, and for whom, if the change is wrong. It tells
   the reviewer how slowly to read. See [One-way doors](#one-way-doors).
4. **`Validation:`** one line saying what was actually run and what was checked
   by hand. When a test is the evidence, name it and say it failed without the
   change: a list of green commands is a claim, not a before and after. Never claim
   a command that was not run; if nothing beyond CI was, leave the line out.
5. **`Closes #N`**, which is what closes the issue on merge
   ([issue-tracker.md](./issue-tracker.md#closing-an-issue)).

Rules:

- **Do not restate the issue.** The investigation, the alternatives and the
  domain reasoning live in the issue or an ADR. Link them; a reviewer who wants
  them follows the link.
- **No `## Summary` heading and no subsections** on a single-issue PR. Headings
  are what turn a few sentences into a document.
- **A picture over a paragraph** when the point of the fix is structure or
  order: a call tree for a control-flow change, a file tree for a move, a
  `diff`-shaped sketch of either, or a Mermaid diagram when several parts talk
  to each other. Keep only the calls or files the point needs, put it beside
  the sentence it supports, and use one, rarely two. A bullet that runs past
  three lines is a sign that a picture would have been shorter.
- **One concern per PR.** If the description needs the word "also", it is two
  PRs. A PRD PR is the deliberate exception: one PR for the chain (see below).
- **Anything the reviewer must do or decide goes first**, above the problem: a
  migration to run, a setting to change, a call that is theirs.
- English, per [coding-standards.md](coding-standards.md) §
  Code Language; Spanish only inside backticks, as data.

Example:

```markdown
The clear button on the data table search did nothing when pressed near its top
edge, and clearing while a search was still loading was dropped.

- The button was centered with `-translate-y-1/2`, which the pressed state's
  `active:translate-y-px` overwrote; it is now centered with `inset-y-0 my-auto`.
- Both tables compared the next href against `useLocation()`, which lags an
  in-flight navigation; they now read the query string the pending navigation
  is heading to, from one shared hook.

Risk: two-way door; blast radius is the search box on the admin tables.

Validation: three new tests (`clears while a search is still loading`, per table
and on the shared hook) put both tables behind a delayed loader and failed
before the fix. The CSS fix has no test and was not clicked through in a browser.

Closes #N
```

### One-way doors

These are always one-way doors on this repo, however small the diff:

- A migration that drops or rewrites data: the contract step of expand and
  contract ([migrations.md](../db/migrations.md#the-exception-mechanism)), a
  backfill that overwrites, or anything the previous container cannot run
  against during the deploy.
- Anything that reaches outside the app: an email sent through Resend, a
  message, a file someone downloads. A revert does not unsend it.
- Writes to payments, prices or comprobantes that reach production data, and
  any change to how an existing comprobante reads.
- Production infrastructure: Coolify, DNS, secrets, the storage volume.
- Deleting data or files anywhere outside a test database.

The session that wrote the change is the one grading it, so a doubtful call is
one-way. A one-way door the reviewer has to act on also goes first (see the
rule above), and the `Risk:` line says what cannot be taken back.

### PRD PRs

One PR carries every sub-issue of a PRD. Its body is one paragraph saying what
the PRD delivers, then `## Sub-issues` listing every sub-issue as a checkbox
that carries its own keyword (`- [ ] Closes #N <title>`), then one `Risk:` line
for the whole chain, then `Closes #<PRD>`.
GitHub closes only the numbers that follow a closing keyword, and closing a
parent does not close its sub-issues: a bare `- [x] #N` stays open after the
merge. The PRD holds the rest. The session
ticks each box when its slice lands on the branch, so the body is the progress
record: a session that resumes the PR reads it there, not in the scrollback,
and nothing is committed to the repository to track it.

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
  it under the fix. Running it again with the same file names replaces the
  assets.
- Motion goes in as a short GIF through the same command. GitHub only gives its
  video player to files uploaded through the browser, so a real video is put in
  the session's final message as a path, and the human drags it into the PR.
- **The repository is public, and so is every asset.** Remove one with
  `gh release delete-asset pr-assets <name>`.
- Never commit PR-only evidence to the repo.

## Babysitting a PR

Seeing a PR through CI and review is the `babysit-pr` skill: a background
subagent waits on `pnpm pr:watch`, fixes the findings that hold, answers the
rest with the reason, and stops at ready to merge. The merge stays the user's.
In a stack, babysit once the whole stack is open: a babysit per layer spends
checks on commits the next layer's push restarts.

Branch protection requires a branch up to date with `master`, and nothing
updates it on its own: the babysit does it once, when being behind is all that
is left (`gh pr update-branch`, or a local merge when it conflicts). A PR nobody
is babysitting is updated the same way by hand. After a stack's bottom layer
merges, the next layer is behind: babysit it again.

CodeRabbit is the second reviewer, configured by `.coderabbit.yaml`, which is
read from the PR's head branch; its `base_branches` entry is what lets a PR
stacked on a non-master branch be reviewed at all. It reviews each push on its
own and reports through its `CodeRabbit` commit status; a pass with no findings
posts no review, only its summary comment. When the status stays pending,
`@coderabbitai review` asks again. Its findings are verified against the source
like any other: it has the diff and the repo's standards, not the issue or the
domain.
