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
3. **`Validation:`** one line saying what was actually run and what was checked
   by hand. Never claim a command that was not run; if nothing beyond CI was,
   leave the line out.
4. **`Closes #N`**, which is what closes the issue on merge
   ([issue-tracker.md](./issue-tracker.md#closing-an-issue)).

Rules:

- **Do not restate the issue.** The investigation, the alternatives and the
  domain reasoning live in the issue or an ADR. Link them; a reviewer who wants
  them follows the link.
- **No `## Summary` heading and no subsections** on a single-issue PR. Headings
  are what turn four sentences into a document.
- **One concern per PR.** If the description needs the word "also", it is two
  PRs. A PRD PR is the deliberate exception: one PR for the chain (see below).
- **Anything the reviewer must do or decide goes first**, above the problem: a
  migration to run, a setting to change, a call that is theirs.
- English, per [CODING_STANDARDS.md](../../.sandcastle/CODING_STANDARDS.md) §
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

Validation: three new tests put both tables behind a delayed loader and failed
before the fix. The CSS fix has no test and was not clicked through in a browser.

Closes #N
```

### PRD PRs

One PR carries every sub-issue of a PRD. Its body is one paragraph saying what
the PRD delivers, then `## Sub-issues` listing every sub-issue as a checkbox
(number and title), then `Closes #<PRD>`. The PRD holds the rest. The session
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

When asked to see a PR through: read the checks and the review comments newer
than the last push, verify each finding against the source, fix the real ones
and answer the false positives with the reason. Say nothing when nothing is
new. Stop when CI and the review are clean on the latest commit.

CodeRabbit is the second reviewer: it reviews every PR on its own, configured
by `.coderabbit.yaml`. Its findings are verified against the source like any
other — it has the diff and the repo's standards, not the issue or the domain.
