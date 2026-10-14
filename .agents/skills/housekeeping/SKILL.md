---
name: housekeeping
description: "Clean up what finished threads leave on this machine that T3's storage cleanup does not: local branches, per-worktree databases, fallow caches, worktrees T3 did not create. Use when asked for housekeeping, a cleanup, or which worktrees or branches can be removed."
---

<!-- Local. The judgement lives in `scripts/worktree-sweep.ts`; this skill only runs it. -->

# Housekeeping

T3 Code's storage cleanup removes the worktrees T3 created, once their PR merges or their last
thread is deleted, and keeps their branches; the sweep does the rest
([t3-dependencies.md](../../../docs/agents/t3-dependencies.md)). `pnpm worktree:sweep` decides what
is safe to remove; the skill never second-guesses it. Nothing is removed until the user accepts
the dry run's report.

1. Run `pnpm worktree:sweep` (the dry run: it lists, changes nothing) and report:
   - **Would remove**: the worktrees T3 did not create (Agent-tool ones under
     `.claude/worktrees/`, fallow caches) and the local branches no worktree holds, as counts by
     reason (PR merged or closed, never committed), plus the databases it would drop. Name every
     never-committed worktree: a paused thread with no shell open looks exactly like a finished
     one, so those are where the user's eye is needed.
   - **Kept**, every worktree and branch with its reason. "In use by bash" usually means a thread
     still holds a shell there; closing or archiving that thread frees it for the next sweep.
   - **Left to T3**, as a count. Why T3 kept one is in T3's Settings → Storage → Last run; a
     finished thread's worktree goes when the thread is deleted.

   Then stop. Done when the user accepts, names worktrees or branches to spare, or declines. A
   request only to see what could be removed ends here.

2. On acceptance, run `pnpm worktree:sweep --apply`, adding `--keep <folder or branch>` for each
   one the user spared. It removes only what the dry run listed: each worktree with its branch,
   each branch, and the `en-escena-wt-*` database of every worktree that is gone, T3's included.
   Anything that became removable since is kept as "not in the accepted dry run" and waits for
   the next report.
3. Report what was removed as counts, anything it left on an error, and every kept worktree and
   branch with its reason. A kept one is the user's call: name it and leave it.
