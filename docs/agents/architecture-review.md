# Architecture Review

Architecture Review is a weekly pass that proposes one deepening opportunity as a PRD-shaped
issue. It is a **T3 Code scheduled task in the En Escena project**, "Architecture review
(weekly)", every Monday at 09:00 local time. Each run starts a fresh thread in the project, in a
worktree T3 creates from `origin/master` for that run, and works as a full session, with the
repo's skills and `AGENTS.md`. Until 2026-10-13 it was a
GitHub Actions workflow with its own runner; why it moved is ADR-0016's amendment of that date.

## The contract

- **Read-only on code.** The run reviews its own T3 worktree of `origin/master`, never the
  project root, and makes no edits, commits or PRs. The worktree and its branch are T3's: the
  worktree goes when the run's thread is deleted (T3's storage cleanup), the branch with the next
  `housekeeping` sweep.
- **The checkout comes from the task's settings.** In T3's Settings → Scheduled tasks, the task
  creates a new worktree with Base branch `master` and Start from origin on. A task created or
  rebound over MCP gets base `main` instead, which this repo does not have, so every run would
  fail before the agent starts (pingdotgg/t3code#16183); set it back in the app after either.
  T3 records such a run as succeeded (pingdotgg/t3code#17889): the run's thread, not the task's
  status, shows whether it worked.
- **At most one issue.** The run's one write is `gh issue create` with the labels
  `source:architecture-review` and `needs-triage`. When every candidate is already covered by a
  prior proposal, it creates nothing and ends its thread with why.
- **A human takes it from there.** The PRD is triaged like any issue, and a local session slices
  it with `to-tickets`.
- **It runs only while this machine and T3 Code are up.** A Monday the app is closed is a week
  with no review.

The prompt asks the run to read `AGENTS.md`, `GLOSSARY.md`, `docs/adr/`, `docs/agents/domain.md`,
`docs/agents/coding-standards.md` and the `codebase-design` and `domain-modeling` skills. Renaming
or moving any of them means updating the prompt.

## The prompt

This is the task's prompt as scheduled. **The schedule in T3 Code is what runs; this copy is what
the repo can review.** Editing it means updating the scheduled task in T3 Code too (the
`schedule_task` tool with the task's `scheduledTaskId`, or the app's scheduled tasks), in the same change.

```markdown
Weekly architecture review of leomontigatti/en-escena. This run is unattended: there is no user to ask, so make every call yourself.

## Rules

- Read-only on code: no edits, commits, branches or PRs. The single write you may make is the one issue in step 6.
- Work in this thread's worktree: T3 created it from `origin/master` for this run. Never the project root, and no worktree of your own.

## Steps

1. List prior proposals so you don't repeat them: `gh issue list --label source:architecture-review --state all --limit 200 --json number,title,state,body`.
2. Read `AGENTS.md`, `GLOSSARY.md`, `docs/adr/` (ADRs are binding: never propose against one), `docs/agents/domain.md` and `docs/agents/coding-standards.md`.
3. Call the Skill tool with "codebase-design" before exploring; it is the vocabulary candidates are judged in (module, interface, depth, seam, leverage, locality). For a glossary-alignment candidate, also call it with "domain-modeling".
4. Explore and pick ONE high-leverage deepening opportunity that no prior proposal covers (deletion test, module deepening, glossary alignment). If every reasonable candidate is covered, skip: create no issue, and end with why.
5. Write the PRD as a spec, not a sketch: concrete enough that a to-tickets session and the implementers can work from it without re-deriving decisions. Sections, in this order:
   - Problem Statement
   - Solution
   - User Stories (a long numbered list: "As a <actor>, I want <feature>, so that <benefit>")
   - Implementation Decisions (modules, interfaces, schema and API contracts; no file paths or code, except a trimmed prototype snippet that pins a decision)
   - Testing Decisions (good tests here, the test seams, prior art)
   - Out of Scope (specific)
   - Further Notes (open questions and risks). End it with a `### Documentation drift` list of any current-state doc you read that the code contradicts: the doc, its claim, the file that contradicts it. Don't hunt for drift; just report what you ran into.
6. Publish it:
   - Create the two labels only if they are missing; never overwrite existing ones: `gh label list --search source:architecture-review` / `gh label list --search needs-triage`, and `gh label create <name>` only for a missing one (`--color 5319E7` for source:architecture-review).
   - `gh issue create --title "<title>" --body-file <file> --label source:architecture-review --label needs-triage`
7. End with the issue URL (or "skipped" and why), your pick, and the candidates you weighed.
```

## Local choices

- **Weekly, not per weekday.** Between 2026-07-20 and 2026-09-01 the daily workflow proposed 33
  PRDs and 5 were resolved: the queue grew about five times faster than it drained, and the
  duplicate-avoidance rule pushes a faster cadence toward ever more marginal candidates.
- **Documentation drift.** The prompt asks the run to list any contradiction between a
  current-state document and the code it happened to read under `### Documentation drift`. It is
  a trial of whether a docs-staleness pass would earn its own task; if the heading keeps coming
  back empty, drop the rule.

## The label

`source:architecture-review` is listed, with colour and description, in the `provenance` group of
[`.github/labels.json`](../../.github/labels.json), and `pnpm labels:sync` creates or updates it
in the repo (it never deletes). The prompt creates it only when it is missing, so the file's
colour is the one that holds.
