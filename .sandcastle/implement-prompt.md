# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Use the issue context below as the initial source of truth. It is truncated to
keep this run focused. Run `gh issue view {{TASK_ID}} --comments` only if the
truncated context is missing information needed to complete the task. If it has
a parent PRD and the parent context below is still insufficient, pull in that
PRD too.

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
ambiguous. Do not read coding standards just to do a general cleanup pass; the
reviewer owns standards and maintainability review. The validation order for
this repo is already listed below; do not rediscover it by reading workflow docs
unless they are relevant to the task.

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

Focus on implementing the requested behavior. Keep code clear enough to finish
the issue safely, but do not spend time on broad refactors, stylistic cleanup,
or maintainability review that is not required for the task. The reviewer will
apply project coding standards after implementation.

Use the vendored skill rules below while implementing. They are intentionally
included here so the sandbox does not need access to any global agent skills.

## TDD / RGR rules

Use RGR when there is an existing or practical public seam for the behavior.
Choose seams from the app's public interfaces and existing test patterns: route
loaders/actions, rendered user behavior, repository/service APIs, domain
functions, CLI commands, or other boundaries callers actually use. In this
non-interactive Sandcastle run, do not stop to ask the user to approve a seam;
use established repo seams and mention the chosen seam in the commit message if
it is not obvious.

Good tests verify observable behavior through public interfaces. Avoid tests
that depend on private methods, internal collaborators, call counts, call order,
or implementation-shaped snapshots. Expected values should come from the issue,
a known literal, or a worked example rather than recomputing the implementation.

Mock only system boundaries such as external APIs, email, payment providers,
time, randomness, or filesystem access. Do not mock local modules you control
just to make an internal interaction easy to assert. Prefer the repo's test
database or established test harness over database mocks when persistence
behavior matters.

Work in vertical slices: one failing behavior test, the minimum implementation
to pass it, then the next slice. Do not write a broad suite for imagined future
behavior before the first implementation exists.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

If no correct automated seam exists for the issue, state that explicitly in the
commit message or issue comment, run the tightest manual/focused validation you
can, and keep the code change minimal.

## Bug diagnosis rules

For issues labeled or described as bugs, first build a feedback loop that can
catch the user's exact symptom: a failing test, route/action invocation,
browser/DOM check, CLI command, throwaway harness, or another deterministic
signal. Reproduce and minimize the bug before changing production code.

Generate a small set of falsifiable hypotheses before editing. Use targeted
instrumentation only when it tests a specific hypothesis, tag temporary logs
with a unique `[DEBUG-...]` prefix, and remove all such instrumentation before
committing.

Turn the minimized repro into a regression test at a correct seam when one
exists. After the fix, rerun both the regression test and the original feedback
loop so the observed symptom is confirmed fixed.

## External research rules

If the implementation depends on external API behavior, upstream source code,
library docs, or framework semantics that are not already clear from the repo,
use primary sources only: official docs, source code, specifications, or
first-party APIs. Record any decision-relevant finding in the commit message or
issue comment with enough detail that the reviewer can verify why the choice was
made.

# FEEDBACK LOOPS

Before committing, run the validation commands in this order:

1. `pnpm format` when you need to apply formatting, otherwise
   `pnpm format:check` for final formatting verification
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm check:file-tokens`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm test:db` if the change touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules
7. `pnpm build` if the change touches routing, server rendering, bundling, CSS, or deployment behavior

If a command fails, fix that failure and rerun the same command before moving to the next one.
Do not start `typecheck`, tests, DB tests, or build while formatting or
`format:check` is failing, while repo-style or file-token checks are failing, or
while formatting changes are unverified. Do not run validation commands in
parallel when later commands depend on earlier code state.
`pnpm check:file-tokens` is strict for staged application source files. If it
fails, split at a clear module boundary before committing; do not create shallow
wrappers just to reduce token count.
When validation output is long, use the failing test names, error summaries, and
focused reruns to diagnose. Do not paste or re-read full logs when a narrower
command gives the needed signal.
During development, use focused test commands for the code you are changing.
For focused DB tests, use `pnpm test:db:file -- <path-to-db-test>`; this
uses the fast PGlite harness for one file. Do not expect
`pnpm test:db -- <path>` to narrow the suite.
For final database-backed validation, use `pnpm test:db`; this is the
reliable Postgres path through `TEST_DATABASE_URL`. Do not use the experimental
full PGlite suite (`pnpm test:db:fast:full`) as the final confidence check.
Run the full validation sequence once at the end. If `pnpm test:db` fails
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
