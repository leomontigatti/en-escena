# TASK

Review the code changes on branch `{{BRANCH}}` against project coding standards
and improve code clarity, consistency, and maintainability while preserving exact
functionality.

# GIT / WORKTREE SAFETY

Before reviewing or committing review fixes, verify the sandbox is on the
expected issue branch and that Git can read the worktree normally:

```bash
git branch --show-current
git rev-parse --show-toplevel
git status --short --branch
```

The current branch must be `{{BRANCH}}`. If Git reports missing worktree
metadata, a broken `.git` indirection, or any other repository-state error, stop
and report the blocker. Do not try to repair or bypass it with `git --git-dir`,
`git --work-tree`, `GIT_DIR`, or `GIT_WORK_TREE`.

Never commit review fixes to `{{BASE_BRANCH}}` or any branch other than
`{{BRANCH}}`. Do not output `<promise>COMPLETE</promise>` after making review
changes unless those changes are committed on `{{BRANCH}}` and the worktree is
clean.

# CONTEXT

## Branch diff

!`git diff --stat {{BASE_BRANCH}}...{{BRANCH}}`

## Changed files

!`git diff --name-only {{BASE_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{BASE_BRANCH}}..{{BRANCH}} --oneline`

# REVIEW PROCESS

Use the vendored code-review rules below while reviewing. They are included
here so this prompt is self-contained inside the Sandcastle sandbox.

1. **Understand the change**: Read the diff and commits above to understand the intent.
   Use targeted `git diff {{BASE_BRANCH}}...{{BRANCH}} -- <path>` commands for
   the files that need review. Start with the changed files list and avoid
   loading the full branch diff unless the scoped diffs do not explain the
   change.

2. **Pin the review base**: Treat `{{BASE_BRANCH}}` as the fixed point and
   review the three-dot diff `{{BASE_BRANCH}}...{{BRANCH}}`. Confirm the base
   ref resolves and the diff is non-empty before spending time on detailed
   review. Use the commit list above to understand intent and scope.

3. **Identify the spec source**: Find the issue or PRD that defines the work.
   Prefer, in order: issue references in commit messages, a
   `sandcastle/issue-<id>` branch name, explicit `Closes #<id>` / `Fixes #<id>`
   references, or a matching PRD/spec under `docs/`, `specs/`, or `.scratch/`.
   For issue-backed work, fetch the issue with `gh issue view <id> --comments`
   and check every acceptance criterion. If there is no spec source, continue
   the Standards review and note that the Spec review is limited.

4. **Run a two-axis review**: Keep these axes separate so one does not mask the
   other:

   - **Standards**: Does the diff follow documented repo standards and avoid
     avoidable complexity?
   - **Spec**: Does the diff faithfully implement the issue or PRD, without
     missing acceptance criteria or adding unrequested behavior?

5. **Analyze for standards improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code
   - Keep changed application modules under 5500 estimated tokens by splitting
     at real module boundaries, not by adding shallow pass-through wrappers

   Also apply this smell baseline as judgement calls, not automatic violations.
   Documented repo standards override this baseline, and tooling-enforced issues
   should be left to tooling:

   - **Mysterious Name**: a function, variable, or type whose name does not
     reveal what it does or holds
   - **Duplicated Code**: the same logic shape appears in more than one hunk or
     file
   - **Feature Envy**: code reaches into another object's data more than its own
   - **Data Clumps**: the same few fields or params keep travelling together
   - **Primitive Obsession**: a primitive or string stands in for a domain concept
   - **Repeated Switches**: the same conditional cascade on the same type recurs
   - **Shotgun Surgery**: one logical change forces scattered edits across many
     files
   - **Divergent Change**: one module is edited for unrelated reasons
   - **Speculative Generality**: abstraction, parameters, or hooks are added for
     needs the spec does not have
   - **Message Chains**: callers navigate long object chains they should not know
   - **Middle Man**: a function or module mostly delegates without adding value
   - **Refused Bequest**: an implementation ignores most of what it inherits

6. **Check spec correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Does the branch satisfy every acceptance criterion listed in the GitHub issue?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?
   - Is there scope creep: behavior, UI, migrations, or abstractions not asked
     for by the issue/PRD?

7. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

8. **Apply project standards**: You are the standards pass for this Sandcastle
   pipeline. Follow the coding standards defined in
   @.sandcastle/CODING_STANDARDS.md (canonical), and use
   `docs/agents/style-guide.md` for app UI changes. Make standards-driven
   refinements here rather than assuming the implementer already handled them.

9. **Preserve functionality**: Never change what the code does unless required
   to satisfy a missed acceptance criterion or fix a correctness bug introduced
   by the branch. Refactors should preserve original outputs and behaviors.

# PROGRESS UPDATES

Keep user-facing progress updates short and phase-level. Do not stream every
`sed`, `rg`, `git diff`, or `gh` command in user-facing updates. Detailed
command traces belong in Sandcastle logs. Mention individual commands only when
they fail, change state, or are the validation result.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run validation in this exact order: `pnpm format` when formatting needs to be applied, otherwise `pnpm format:check` for final formatting verification; `pnpm check:repo-styles` when the branch adds or edits app UI code; `pnpm check:file-tokens`; `pnpm typecheck`; `pnpm test`; `pnpm test:db` if the branch touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules; and `pnpm build` if the branch touches routing, server rendering, bundling, CSS, or deployment behavior. For focused DB diagnosis use `pnpm test:db:file -- <path-to-db-test>`; for final database-backed validation use `pnpm test:db`, which is the reliable Postgres path through `TEST_DATABASE_URL`. Do not use the experimental full PGlite suite (`pnpm test:db:fast:full`) as the final confidence check. If a command fails, fix it and rerun that same command before starting the next one. Do not run validation commands in parallel when later commands depend on earlier code state.
3. Commit describing the refinements

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.
