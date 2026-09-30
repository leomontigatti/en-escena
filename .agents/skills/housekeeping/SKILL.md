---
name: housekeeping
description: "Clean up what finished threads leave on this machine: stale worktrees, their branches and databases, fallow caches. Use when asked for housekeeping, a cleanup, or which worktrees can be removed."
---

<!-- Local. The judgement lives in `scripts/worktree-sweep.ts`; this skill only runs it. -->

# Housekeeping

`pnpm worktree:sweep` decides what is safe to remove; the skill never second-guesses it.

1. Run `pnpm worktree:sweep` (it lists, changes nothing). When the user asked only what could
   be removed, report its two lists and stop here.
2. Run `pnpm worktree:sweep --apply`. The request for housekeeping is the permission: the
   sweep removes only worktrees whose PR merged or closed, or that never committed, with
   nothing uncommitted, nothing on no remote, and no process inside. It removes each worktree,
   its local branch and its `en-escena-wt-*` database.
3. Report what was removed as a count, and every kept worktree with its reason. A kept
   worktree is the user's call: name it and leave it, whatever the reason. "In use by bash"
   usually means a T3 thread still holds a shell there; closing or archiving that thread
   frees it for the next sweep.
