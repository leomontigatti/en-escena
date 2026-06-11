# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Use the issue context below as the initial source of truth. It is truncated to
keep this run focused. Run `gh issue view {{TASK_ID}} --comments` only if the
truncated context is missing information needed to complete the task. If it has
a parent PRD, pull in that PRD too.

<issue-context>

{{ISSUE_CONTEXT}}

</issue-context>

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log --oneline -10`

</recent-commits>

# EXPLORATION

Explore the repo with targeted searches and bounded file reads. Gather the
smallest useful context that lets you complete the task safely.

Pay extra attention to test files that touch the relevant parts of the code.
Prefer `rg`, `rg --files`, `git diff --stat`, and focused `sed -n` ranges over
broad dumps. Avoid reading generated files, build output, large lockfiles, or
whole diffs unless a failure requires it. When a command can produce a lot of
output, narrow it with paths, patterns, or line ranges before running it.
Read `docs/agents/*`, `CONTEXT.md`, and ADRs only when the issue touches agent
workflow, auth, database/domain behavior, UI/style, or when the issue context is
ambiguous. The validation order for this repo is already listed below; do not
rediscover it by reading workflow docs unless they are relevant to the task.

# PROGRESS UPDATES

Keep user-facing progress updates short and phase-level:

- Exploring context
- Writing red test
- Implementing
- Running focused validation
- Running full validation
- Committing
- Updating issue

Do not stream every `sed`, `rg`, `git diff`, or `gh` command in user-facing
updates. Detailed command traces belong in Sandcastle logs. Mention individual
commands only when they fail, change state, or are the validation result.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run the validation commands in this order:

1. `npm run format`
2. `npm run format:check`
3. `npm run typecheck`
4. `npm run test`
5. `npm run test:db` if the change touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules
6. `npm run build` if the change touches routing, server rendering, bundling, CSS, or deployment behavior

If a command fails, fix that failure and rerun the same command before moving to the next one.
Do not start `typecheck`, tests, DB tests, or build while formatting or
`format:check` is failing, or while formatting changes are unverified. Do not run validation
commands in parallel when later commands depend on earlier code state.
When validation output is long, use the failing test names, error summaries, and
focused reruns to diagnose. Do not paste or re-read full logs when a narrower
command gives the needed signal.
During development, use focused test commands for the code you are changing.
For focused DB tests, use `npm run test:db:file -- <path-to-db-test>`; do not
expect `npm run test:db -- <path>` to narrow the suite.
Run the full validation sequence once at the end. If `npm run test:db` fails
because of infrastructure or unrelated database state, do a focused diagnosis
before repeating the full DB suite. Do not run multiple DB validation commands
in parallel against the shared test database.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
