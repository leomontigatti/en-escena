---
name: housekeeping
description: "Clean up what finished threads leave on this machine: stale worktrees, their branches and databases, fallow caches. Use when asked for housekeeping, a cleanup, or which worktrees can be removed."
---

<!-- Local. The judgement lives in `scripts/worktree-sweep.ts`; this skill only runs it. -->

# Housekeeping

`pnpm worktree:sweep` decides what is safe to remove; the skill never second-guesses it. Nothing
is removed until the user accepts the dry run's report.

1. Run `pnpm worktree:sweep` (the dry run: it lists, changes nothing) and report:
   - **Would remove**, as counts by reason (PR merged or closed, never committed, fallow caches),
     plus the databases it would drop. Name every never-committed worktree: a paused thread with
     no shell open looks exactly like a finished one, so those are where the user's eye is needed.
   - **Kept**, every worktree with its reason. "In use by bash" usually means a T3 thread still
     holds a shell there; closing or archiving that thread frees it for the next sweep.

   Then stop. Done when the user accepts, names worktrees to spare, or declines. A request only
   to see what could be removed ends here.

2. On acceptance, run `pnpm worktree:sweep --apply`, adding `--keep <folder>` for each worktree
   the user spared. It removes each worktree, its local branch and its `en-escena-wt-*` database.
3. Report what was removed as a count, anything removed that the dry run did not list (the
   apply re-judges the tree, so a thread that finished in between goes too), anything it left on
   an error, and every kept worktree with its reason. A kept worktree is the user's call: name it
   and leave it.
