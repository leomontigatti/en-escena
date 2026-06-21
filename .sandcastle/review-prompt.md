# TASK

Review the code changes on branch `{{BRANCH}}` against project coding standards
and improve code clarity, consistency, and maintainability while preserving exact
functionality.

# CONTEXT

## Branch diff

!`git diff --stat {{BASE_BRANCH}}...{{BRANCH}}`

## Changed files

!`git diff --name-only {{BASE_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{BASE_BRANCH}}..{{BRANCH}} --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.
   Use targeted `git diff {{BASE_BRANCH}}...{{BRANCH}} -- <path>` commands for
   the files that need review. Start with the changed files list and avoid
   loading the full branch diff unless the scoped diffs do not explain the
   change.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Does the branch satisfy every acceptance criterion listed in the GitHub issue?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Apply project standards**: You are the standards pass for this Sandcastle
   pipeline. Follow the coding standards defined in
   @.sandcastle/CODING_STANDARDS.md, and make any standards-driven refinements
   here rather than assuming the implementer already handled them.

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# PROGRESS UPDATES

Keep user-facing progress updates short and phase-level. Do not stream every
`sed`, `rg`, `git diff`, or `gh` command in user-facing updates. Detailed
command traces belong in Sandcastle logs. Mention individual commands only when
they fail, change state, or are the validation result.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run validation in this exact order: `npm run format`, `npm run format:check`, `npm run typecheck`, `npm run test`, `npm run test:db` if the branch touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules, and `npm run build` if the branch touches routing, server rendering, bundling, CSS, or deployment behavior. For focused DB diagnosis use `npm run test:db:file -- <path-to-db-test>`; for final database-backed validation use `npm run test:db`, which is the reliable Postgres path through `TEST_DATABASE_URL`. Do not use the experimental full PGlite suite (`npm run test:db:fast:full`) as the final confidence check. If a command fails, fix it and rerun that same command before starting the next one. Do not run validation commands in parallel when later commands depend on earlier code state.
3. Commit describing the refinements

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.
