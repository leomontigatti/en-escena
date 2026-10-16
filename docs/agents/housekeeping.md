# Housekeeping

The per-worktree resources this repo makes, and the sweep that replaces steps 2 and 3 of the
shared `housekeeping` skill. Step 1 (check T3's storage-cleanup rules) and step 4 (the report)
stay the skill's.

## Per-worktree resources

- **A database**, `en-escena-wt-<worktree folder>`, in the shared `en-escena-postgres` container,
  created on a worktree's first `pnpm dev`, `db:seed` or `db:migrate`
  ([local-auth.md](../local-auth.md#one-database-per-worktree)). The main checkout keeps
  `en-escena`; the test database is shared.
- **fallow caches**: `/tmp/fallow-audit-base-cache-*`, git worktrees `pnpm check:fallow` leaves
  ([fallow.md](fallow.md)).

## The sweep

`pnpm worktree:sweep` (`scripts/worktree-sweep.ts`) does the survey and the removal. It
removes nothing T3 created: it reports those as left to T3.

1. **List the live threads.** A paused thread may have no worktree (T3 removes it under the
   inactive and unchanged rules and recreates it from the kept branch on resume), so the sweep
   needs the threads, which only T3's tools can give. Page through `t3_thread_list` with
   `settled: false`; for each thread, `t3_thread_read` (with `limit: 1`) gives `branch`,
   `worktreePath` and `archived`. Write every thread that is not archived to a file outside the
   repo, as `[{"branch": "...", "worktreePath": "..."}]` (either may be `null`). With many
   threads, give the reads to one subagent and have it write the file.
2. **Dry run**: `pnpm worktree:sweep --threads <file>`. It lists, changing nothing: the worktrees
   T3 did not create (Agent-tool ones under `.claude/worktrees/`, fallow caches) and the local
   branches no worktree holds that it would remove, by reason (PR merged or closed, or never
   committed); the `en-escena-wt-*` databases it would drop; every worktree and branch it keeps,
   with the reason; and T3's own worktrees, as left to T3. A branch or worktree path a live
   thread holds is kept as "live thread", and so is its database. "In use by bash" usually means
   a thread still holds a shell there. Without `--threads` the sweep refuses to run.
3. **Apply**, once the user accepts: `pnpm worktree:sweep --threads <file> --apply`, adding
   `--keep <folder, path or branch>` for each one the user spared. It removes only what the dry
   run listed, databases included, each by name: anything that became removable since is kept as
   "not in the accepted dry run" and waits for the next report.

The dry run's list lives in the main checkout's `.git/worktree-sweep-accepted.json`, so a dry run
and its `--apply` agree from any worktree.
