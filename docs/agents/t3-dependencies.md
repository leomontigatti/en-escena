# T3 Code dependencies

What this repo's own workflows assume about T3 Code, beyond what the shared workflow's
`t3-dependencies.md` (in leomontigatti/agent-workflow, installed at `~/.agents/workflow`) records
for the shared skills. The `t3-update-review` skill reads both after every T3 update; agents
don't need this file for everyday work.

Status of an entry:

- **active**: we rely on T3 behaving this way; an update that changes it breaks us.
- **watching**: a workaround for something T3 can't do (yet), or a workflow T3
  could do natively better, faster or cheaper. "Would improve if" is the exact
  condition that lets us simplify.
- **ready**: the condition is met in the installed T3, but we haven't adopted it yet.
- **resolved**: adopted; kept as history.

Checked against T3 Code 0.0.46-nightly.20261014.3105 (commit 3417bc3856a2), and the thread tools
on 2026-10-16.

## Active

### worktree-sweep-reads-t3-settings

- **Relies on:** T3's storage cleanup counts as its own the worktrees inside `<T3 home>/worktrees` (`$T3CODE_HOME`, else `~/.t3`), the `worktreesDirectory` setting and the folders in `previousWorktreesDirectories`, compared as canonical paths (`apps/server/src/worktreesDirectory.ts`; `apps/server/src/storageCleanup.ts`, `cleanWorktrees`). It deletes ignored files, so the `.env` symlink goes and its target in the main checkout stays, and it touches no database or `/tmp` cache.
- **Used by:** `scripts/worktree-sweep.ts` (`t3WorktreeFolders` reads those two settings from `<T3 home>/userdata/settings.json`; `isManagedByT3` reports those worktrees as left to T3 and never removes them); `docs/agents/housekeeping.md` § The sweep.
- **Breaks if:** T3 renames those settings, moves `settings.json`, or runs with a `T3CODE_HOME` the sweep's shell lacks, so the sweep judges T3's worktrees as its own.

### thread-read-gives-branch

- **Relies on:** `t3_thread_list` takes `settled: false` and pages with a cursor; `t3_thread_read` returns a thread's `branch`, `worktreePath` and `archived`, including for a thread whose worktree T3 removed (the path stays recorded). `t3_thread_list` itself returns no branch.
- **Used by:** `docs/agents/housekeeping.md` § The sweep (step 1 builds the live-threads file `pnpm worktree:sweep --threads` requires).
- **Breaks if:** `t3_thread_read` stops returning those fields, or the list stops filtering by `settled`; the sweep then has no list of live threads and refuses to run.

### scheduled-run-worktree

- **Relies on:** a scheduled task not bound to a thread launches each run as a fresh thread with the task's stored `workspaceStrategy`; with `{type: "worktree", baseRef: "master", startFromOrigin: true}` that is a new T3-managed worktree from `origin/master` (`apps/server/src/scheduledTasks/ScheduledTaskService.ts`, the run's `launchThread`). The app's Settings → Scheduled tasks edits the strategy ("Create a new worktree", Base branch, Start from origin; `apps/web/src/components/settings/ScheduledTasksSettings.tsx`). `update_scheduled_task` keeps it unless `bindToCurrentThread` is passed (`apps/server/src/mcp/OrchestratorMcpService.ts`).
- **Used by:** `docs/agents/architecture-review.md` § The contract and § The prompt (the "Work in this thread's worktree" rule).
- **Breaks if:** unbound runs stop getting a worktree from the stored strategy, the app loses the Base branch field, or `update_scheduled_task` starts resetting the strategy on a prompt-only update.

## Watching

### architecture-review-needs-app

- **Workaround:** none. The weekly run happens only while this machine and T3 Code are up; a missed Monday is a missed week (`docs/agents/architecture-review.md` § The contract).
- **Used by:** `docs/agents/architecture-review.md` § The contract.
- **Would improve if:** scheduled tasks run while the desktop app is closed. `docs/user/background-service.md` covers the server as a service and says nothing about scheduled tasks.
- **Watch:** `docs/user/background-service.md`.

### scheduled-thread-base-main

- **Workaround:** the Architecture Review task's Base branch is set to `master` in the app's Settings → Scheduled tasks. A task created or rebound over MCP gets `{baseRef: "main", startFromOrigin: true}`, hard-coded at 3417bc3856a2 in `scheduledTaskWorkspaceStrategy` (`apps/server/src/mcp/OrchestratorMcpService.ts`); this repo has no `main`, so every run would fail at worktree preparation, while the scheduler records it as succeeded.
- **Used by:** `docs/agents/architecture-review.md` § The contract ("The checkout comes from the task's settings").
- **Would improve if:** a task made over MCP takes the project's default branch (or accepts a `workspaceStrategy`).
- **Watch:** pingdotgg/t3code#16183 (open). The shared `scheduled-run-status` entry watches #17889, the run recorded as succeeded.

## Ready

None yet.

## Resolved

None kept here: the storage-cleanup adoption (2026-10-14, #1655) is the shared
`housekeeping-worktree-removal` entry.
