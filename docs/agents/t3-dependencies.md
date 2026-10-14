# T3 Code dependencies

What this repo's workflows assume about T3 Code. The global `t3-update-review`
skill reads this file after every T3 update; agents don't need it for everyday work.

Status of an entry:

- **active**: we rely on T3 behaving this way; an update that changes it breaks us.
- **watching**: a workaround for something T3 can't do (yet), or a workflow T3
  could do natively better, faster or cheaper. "Would improve if" is the exact
  condition that lets us simplify.
- **ready**: the condition is met in the installed T3, but we haven't adopted it yet.
- **resolved**: adopted; kept as history.

Checked against T3 Code 0.0.46-nightly.20261014.3105 (commit 3417bc3856a2).

## Active

### thread-owned-worktrees

- **Relies on:** a worktree made with a shell `git worktree add` is not bound to the thread: no thread binding, no PR tracking, and no eligibility for T3 storage cleanup (only T3-managed worktrees are). The routes T3 binds are `t3_thread_launch` with `workspaceStrategy` and `t3_worktree_handoff` (`apps/server/src/mcp/toolkits/project/tools.ts`, `worktree/tools.ts`; `docs/user/project-settings.md` § Storage cleanup).
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (Work where you started); `.agents/skills/implement-spec/SKILL.md` § 2. Run the frontier (the Agent-tool exception); `docs/agents/architecture-review.md` § The prompt (the run works in the worktree T3 made for it; see scheduled-run-worktree).
- **Breaks if:** T3 stops binding the worktrees its own launch and handoff tools create, or removes those tools.

### branch-named-by-t3

- **Relies on:** T3 names a new worktree branch with a temporary name, then renames it when the thread starts (`apps/server/src/orchestration-v2/ThreadLaunchService.ts`, `generateBranchNameFor`); the default prefix is `t3/` (`docs/user/project-settings.md` § Worktree branch names). The real name is read with `git branch --show-current`.
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (Branch prefixes).
- **Breaks if:** the rename stops happening, or the worktree's checked-out branch stops being the name T3 shows.

### link-pr-after-create

- **Relies on:** `link_pull_request` records a PR as the thread's linked PR, which T3 settles when it merges (the tool's description in `apps/server/src/mcp/toolkits/pullRequests/tools.ts`). `watch_pull_request` links first if needed. T3 links only the PRs its own git action creates (`apps/server/src/git/linkCreatedPullRequest.ts`), so a shell `gh pr create` needs the call.
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (One thread, one branch, one PR); `.agents/skills/implement/SKILL.md` § 7. Open the PR and hand it off; `.agents/skills/implement-spec/SKILL.md` § 3. Merge each report (step 3).
- **Breaks if:** `link_pull_request` is renamed or removed, or a linked PR stops settling the thread on merge.

### watch-pr-native

- **Relies on:** `watch_pull_request` checks the PR every two minutes and wakes the thread on a failed check, on all required checks passing, on a comment or review from someone else (an edit to an existing comment counts, which is how babysit sees CodeRabbit cancel a review), or on a conflict with the base. Only comments posted after the call wake it. The watch ends at merge or close, and `unwatch_pull_request` returns the thread to the user's inbox. A subagent cannot watch (`apps/server/src/mcp/toolkits/pullRequests/tools.ts`).
- **Used by:** `.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round, § 5. Report; `.agents/skills/implement/SKILL.md` § 7. Open the PR and hand it off; `docs/agents/pull-requests.md` § Babysitting a PR; `docs/agents/workflows.md` § Where work starts.
- **Breaks if:** a wake condition, the end conditions, or what `unwatch_pull_request` does changes, or the tool is renamed.

### delegate-task-reviews

- **Relies on:** `delegate_task` runs a child task that shows under the thread and reports by notification; `task_status` returns its final `summary`; `task_cancel` stops it; each review round takes its own `clientRequestId`; `orchestrator_capabilities` lists the live model ids for `target` (`apps/server/src/mcp/toolkits/orchestrator/tools.ts`).
- **Used by:** `.agents/skills/code-review/SKILL.md` § Spawning a reviewer; `.agents/agents/research.md` and `.agents/agents/reviewer.md` (headers); `docs/agents/agent-configuration.md` § Delegating to subagents.
- **Breaks if:** the `target`, `role` or `clientRequestId` shape changes, children stop reporting to the parent thread, or `task_status` stops returning the summary.

### setup-hold-and-env

- **Relies on:** a `runOnWorktreeCreate` action with `async: false` holds the agent's first turn until the script exits (`packages/contracts/src/t3ProjectFile.ts`, the `async` description). The script gets `T3CODE_PROJECT_ROOT`, and `T3CODE_WORKTREE_PATH` for a worktree (`packages/shared/src/projectScripts.ts`, `projectScriptRuntimeEnv`).
- **Used by:** `t3.json` (the "Setup worktree" action); `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (the paragraph on `t3.json`, "before the agent starts").
- **Breaks if:** `async: false` stops holding the agent, or `T3CODE_PROJECT_ROOT` stops reaching the script.

### auto-pull-default

- **Relies on:** "Automatically pull" fast-forwards the default-branch checkout only when it has no changed files, untracked files or local commits, and skips a checkout on another branch or without an upstream (`docs/user/project-settings.md` § Keep the default branch current).
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (the paragraph on Automatically pull).
- **Breaks if:** it pulls a checkout with local changes or commits, or pulls a branch other than the default.

### storage-cleanup-removes-t3-worktrees

- **Relies on:** with storage cleanup on for this project (on this machine: `storageCleanup` with `worktreeOnMerge: true`, `worktreeOnDelete: true`, `worktreeKeepWhen: "uncommitted-changes"`), T3 removes a T3-managed worktree once its PR merges into the default branch, or once its last thread is deleted, archived threads included. T3-managed means a thread's worktree inside `<T3 home>/worktrees` (`$T3CODE_HOME`, else `~/.t3`), the `worktreesDirectory` setting or a folder in `previousWorktreesDirectories`, compared as canonical paths. It deletes ignored files, so the `.env` symlink goes and its target in the main checkout stays. It keeps the branch and touches no database or `/tmp` cache (`docs/user/project-settings.md` § Storage cleanup; `apps/server/src/storageCleanup.ts`, `cleanWorktrees`; `apps/server/src/worktreesDirectory.ts`).
- **Used by:** `scripts/worktree-sweep.ts` (`t3WorktreeFolders` reads those two settings from `<T3 home>/userdata/settings.json`; `isManagedByT3` reports those worktrees and never removes them); `.agents/skills/housekeeping/SKILL.md` § Housekeeping; `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (Leaving a worktree behind); `docs/agents/architecture-review.md` § The contract (the run's worktree goes with its thread); `docs/operations/scripts.md` § Worktrees.
- **Breaks if:** the policy is turned off or stops running (T3 worktrees pile up: the sweep only lists them); T3 renames those settings, moves `settings.json`, or runs with a `T3CODE_HOME` the sweep's shell lacks, so the sweep judges T3's worktrees as its own again; or T3 removes a worktree whose thread is still live under a rule this repo leaves off ("no commits beyond the default branch", inactive days), since the sweep then deletes a branch with no commits beyond `master` that T3 would recreate the checkout from.

### scheduled-run-worktree

- **Relies on:** a scheduled task not bound to a thread launches each run as a fresh thread with the task's stored `workspaceStrategy`; with `{type: "worktree", baseRef: "master", startFromOrigin: true}` that is a new T3-managed worktree from `origin/master` (`apps/server/src/scheduledTasks/ScheduledTaskService.ts`, the run's `launchThread`). The app's Settings → Scheduled tasks edits the strategy ("Create a new worktree", Base branch, Start from origin; `apps/web/src/components/settings/ScheduledTasksSettings.tsx`). `update_scheduled_task` keeps it unless `bindToCurrentThread` is passed (`apps/server/src/mcp/OrchestratorMcpService.ts`).
- **Used by:** `docs/agents/architecture-review.md` § The contract and § The prompt (the "Work in this thread's worktree" rule).
- **Breaks if:** unbound runs stop getting a worktree from the stored strategy, the app loses the Base branch field, or `update_scheduled_task` starts resetting the strategy on a prompt-only update.

## Watching

### t3json-manual-import

- **Workaround:** import the "Setup worktree" action once per T3 install (project settings → Actions → Import from t3.json). `pnpm dev:info` reports `.env` as missing when this was skipped (`scripts/dev-info.ts`).
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads; `.agents/agents/implementer.md` step 2 (Set it up), which runs the same setup by hand for Agent-tool worktrees.
- **Would improve if:** the setup runner reads `runOnWorktreeCreate` from the checked-in `t3.json` without an import. At 3417bc3856a2 `setupProjectScript` (`packages/shared/src/projectScripts.ts`) only sees the project's imported scripts.
- **Watch:** pingdotgg/t3code#5063 (closed COMPLETED 2026-08-15; at 3417bc3856a2 the setup runner still reads only imported scripts).

### setup-runs-in-main-checkout

- **Workaround:** a "local" thread runs the setup script in the main checkout, untracked, so the agent is not held (`tracked` is only for worktree launches in `apps/server/src/orchestration-v2/ThreadLaunchService.ts`), and `T3CODE_WORKTREE_PATH` is the project root. Our script's `ln -sf` refuses there on GNU `ln` ("are the same file", exit 1, `.env` kept), which stops the `&&` chain before `pnpm install`. The docs say to ignore the failed setup terminal and to keep `ln` first in the script. macOS `ln` is not checked: the upstream report shows `ln -sf` turning the file into a link to itself.
- **Used by:** `t3.json`; `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (Read-only threads).
- **Would improve if:** a thread with no worktree skips `runOnWorktreeCreate`. At 3417bc3856a2 `apps/server/src/orchestration-v2/ThreadLaunchService.ts` passes `cwd = worktreePath ?? project.workspaceRoot` to the setup runner, and the runner (`apps/server/src/project/ProjectSetupScriptRunner.ts`) never checks for a worktree.
- **Watch:** pingdotgg/t3code#18882 (open).

### babysit-gh-checks-wait

- **Workaround:** while checks are still running, babysit waits with `gh pr checks <n> --watch` in the background, so one push answers the whole round (`.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round, "A check still running").
- **Used by:** `.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round.
- **Would improve if:** `watch_pull_request` can wake once every check has finished, not only on the first failure or on all required checks passing.
- **Watch:** pingdotgg/t3code#16924 (open).

### babysit-unreported-required-checks

- **Workaround:** on every wake babysit reads the required contexts from branch protection and holds the round while one has not reported, waiting in the background with `gh pr checks --watch` (`.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round, the "a required one not reported yet" row). The watch reports "required checks passed" on the contexts it can see: `db-gate` runs after `db-shard` (`needs:` in `.github/workflows/ci.yml`), so it is absent for about four minutes, and on 2026-10-14 the watch woke on "All 4 required checks passed" three times before it started.
- **Used by:** `.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round.
- **Would improve if:** `watch_pull_request` reads the base branch's required checks and holds "checks passed" while one is missing.
- **Watch:** pingdotgg/t3code#18047 (Ideas discussion, open, awaiting maintainer approval; it carries this repo's three cases). Its implementation, #17831, was closed unmerged on 2026-10-14 for lacking that approval.

### babysit-behind-on-read

- **Workaround:** `master` requires a branch to be current (`strict: true`), and the watch does not wake when one falls behind. Babysit only sees `BEHIND` when it reads the round on another wake, then updates once (`.agents/skills/babysit-pr/SKILL.md` § 4b. Bring the branch up to date). A PR handed back READY that falls behind later is the user's to update, or the launcher's when it holds the merge (`docs/agents/workflows.md` § Branches, worktrees and T3 Code threads, "A launched thread reports to its own inbox").
- **Used by:** `.agents/skills/babysit-pr/SKILL.md` § 2 (the `BEHIND` row) and § 4b; `docs/agents/pull-requests.md` § Babysitting a PR.
- **Would improve if:** `watch_pull_request` wakes the thread when the PR's merge state becomes `BEHIND`.
- **Watch:** pingdotgg/t3code#18047, the same proposal as babysit-unreported-required-checks.

### babysit-unresolved-threads

- **Workaround:** babysit reads the round itself before the first `watch_pull_request` call and on every wake: unresolved threads, review-body findings and red checks (`.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round).
- **Used by:** `.agents/skills/babysit-pr/SKILL.md` § 2. Wait for the round.
- **Would improve if:** `watch_pull_request` wakes on unresolved review threads when the branch's required resolution rules hold them open.
- **Watch:** pingdotgg/t3code#17703 (open).

### pr-auto-link

- **Workaround:** the explicit `link_pull_request` call after `gh pr create` (see the active entry link-pr-after-create).
- **Used by:** `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (One thread, one branch, one PR).
- **Would improve if:** a PR opened from the thread's branch is linked to the thread without the call. At 3417bc3856a2 `apps/server/src/orchestration-v2/ThreadPullRequestService.ts` finds the branch's PR by name but records it only as the branch PR, not as the linked PR.
- **Watch:** `apps/server/src/orchestration-v2/ThreadPullRequestService.ts`.

### preview-not-used

- **Workaround:** the browser loop runs in `playwright-cli`, not T3's preview tools (`docs/agents/workflows.md` § UI verification).
- **Used by:** `docs/agents/workflows.md` § UI verification.
- **Would improve if:** T3's `preview_click` and `preview_evaluate` report their errors reliably, and its screenshots stop blurring mid-animation (no upstream issue on the blur found).
- **Watch:** pingdotgg/t3code#3714 and #3716 (both open).

### implementer-agent-worktrees

- **Workaround:** `implement-spec` runs each implementer as an Agent-tool worktree outside T3's binding, and removes it by hand (`.agents/skills/implement-spec/SKILL.md` § 3 and § 4. Close out, once).
- **Used by:** `.agents/skills/implement-spec/SKILL.md` § 2. Run the frontier; `.agents/agents/implementer.md`.
- **Would improve if:** an implementer can run as a T3 thread launched with `t3_thread_launch` and a `worktree` `workspaceStrategy`, and the orchestrator reads its report with `t3_thread_wait` and `t3_thread_read`. The worktree is then tracked and cleanup-eligible, and the exception in `docs/agents/workflows.md` goes.
- **Watch:** `apps/server/src/mcp/toolkits/project/tools.ts` (`t3_thread_launch`); `apps/server/src/mcp/toolkits/orchestrator/tools.ts` (`create_threads` text, which points to `t3_thread_launch` for an implementation in its own worktree).

### housekeeping-branches-and-dbs

- **Workaround:** `pnpm worktree:sweep` deletes the local branches no worktree holds (PR merged or closed, or no commits beyond `master`), drops the `en-escena-wt-*` database of every worktree that is gone, T3's included, removes the fallow caches, and removes the worktrees T3 did not create (`scripts/worktree-sweep.ts`).
- **Used by:** `.agents/skills/housekeeping/SKILL.md` § Housekeeping; `docs/agents/workflows.md` § Branches, worktrees and T3 Code threads (Leaving a worktree behind); `docs/local-auth.md` § One database per worktree.
- **Would improve if:** T3 storage cleanup deletes a removed worktree's local branch, or runs a project script when it removes a worktree (the database drop). Its docs say branches stay, and T3 has no such hook.
- **Watch:** `docs/user/project-settings.md` § Storage cleanup.

### architecture-review-needs-app

- **Workaround:** none. The weekly run happens only while this machine and T3 Code are up; a missed Monday is a missed week (`docs/agents/architecture-review.md` § The contract).
- **Used by:** `docs/agents/architecture-review.md` § The contract.
- **Would improve if:** scheduled tasks run while the desktop app is closed. `docs/user/background-service.md` covers the server as a service and says nothing about scheduled tasks.
- **Watch:** `docs/user/background-service.md`.

### scheduled-thread-base-main

- **Workaround:** the task's Base branch is set to `master` in the app's Settings → Scheduled tasks. A task created or rebound over MCP gets `{baseRef: "main", startFromOrigin: true}`, hard-coded at 3417bc3856a2 in `scheduledTaskWorkspaceStrategy` (`apps/server/src/mcp/OrchestratorMcpService.ts`); this repo has no `main`, so every run would fail at worktree preparation. The scheduler records a run as `succeeded` when the launch call returns, whatever the run does after (`runSucceeded = result._tag === "Success"` in `apps/server/src/scheduledTasks/ScheduledTaskService.ts`), so the run's thread is the only signal.
- **Used by:** `docs/agents/architecture-review.md` § The contract ("The checkout comes from the task's settings").
- **Would improve if:** a task made over MCP takes the project's default branch (or accepts a `workspaceStrategy`), and a run that fails is recorded as failed.
- **Watch:** pingdotgg/t3code#16183 (open), #17889 (open). Read a run's thread, not the task's `lastRunStatus`.

## Ready

None yet.

## Resolved

### t3-storage-cleanup

- **Workaround:** `pnpm worktree:sweep` removed finished worktrees with their branches and databases (`scripts/worktree-sweep.ts`, `removeWorktree`).
- **Used by:** `.agents/skills/housekeeping/SKILL.md` step 2; `docs/local-auth.md` § One database per worktree.
- **Would improve if:** T3 storage cleanup removes merged worktrees itself, under a policy the project enables (Settings → Storage; off by default).
- **Watch:** `docs/user/project-settings.md` § Storage cleanup; pingdotgg/t3code#13836 (closed).
- **Met in:** 0.0.46-nightly.20261014.3105 (commit 3417bc3856a2) (https://github.com/pingdotgg/t3code/pull/17563, merged 2026-10-10). **Adopting means:** storage cleanup on with the merged-PR and deleted-thread rules and "Keep worktrees with local changes" at "Uncommitted changes" ("Any local files" would never remove a worktree, since the `.env` symlink is ignored); the sweep narrowed to what T3 does not do.
- **Adopted:** 2026-10-14, #1655. Settings: `worktreeOnMerge` and `worktreeOnDelete` on, `worktreeKeepWhen: "uncommitted-changes"`. The sweep now only reports T3's worktrees and still handles branches, databases, fallow caches and the worktrees T3 did not create; what it relies on is the active entry storage-cleanup-removes-t3-worktrees.
