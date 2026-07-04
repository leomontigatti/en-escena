# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them using the vendored conflict rules
   below
3. After resolving conflicts, run validation in this exact order: `pnpm format` when formatting needs to be applied, otherwise `pnpm format:check` for final formatting verification; `pnpm check:repo-styles` when the merged branch adds or edits app UI code; `pnpm check:file-tokens`; `pnpm typecheck`; `pnpm test`; `pnpm test:db` if the merged branch touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules; and `pnpm build` if the merged branch touches routing, server rendering, bundling, CSS, or deployment behavior. `pnpm test:db` is the reliable Postgres path through `TEST_DATABASE_URL`; do not use the experimental full PGlite suite (`pnpm test:db:fast:full`) as the final confidence check
4. If validation fails, fix the issue and rerun the same command before proceeding to the next command or branch. Do not run validation commands in parallel when later commands depend on earlier code state.

Keep merge fixes minimal. Do not perform a coding-standards or maintainability
review during merge; the reviewer already owns that pass. Change code only to
resolve conflicts, preserve branch behavior, or make required validation pass.

After all branches are merged, make a single commit summarizing the merge.

# CONFLICT RULES

These rules vendor the merge-conflict skill into this prompt so the sandbox does
not need access to global agent skills.

1. **See the current state**: inspect `git status`, the conflicted files, the
   branch being merged, and the commits on that branch. Use scoped commands such
   as `git diff --name-only --diff-filter=U`, `git diff --ours -- <path>`, and
   `git diff --theirs -- <path>` to understand each conflict.

2. **Find the primary sources for intent**: for each conflicted area, read the
   relevant branch commits and the issue/PRD behind the branch. Use the issue
   list below, commit messages, and `gh issue view <id> --comments` when needed.
   If a conflict involves surrounding code from the target branch, read the
   target-side history or nearby tests enough to understand why that code exists.

3. **Resolve each hunk by intent**: preserve both branches' intended behavior
   whenever possible. When both intents cannot coexist, choose the resolution
   that matches the merge goal and issue acceptance criteria, and note the
   trade-off in the merge commit or issue comment. Do not invent new product
   behavior while resolving a conflict.

4. **Always complete the merge**: do not abort a merge because a conflict is
   difficult. Resolve the files, run the required validation, fix only what the
   merge broke, stage the resolution, and continue to the next branch.

5. **Keep conflict fixes narrow**: if validation fails after a merge, first
   determine whether the failure was caused by the merge resolution. Only make
   the smallest change needed to restore the combined intended behavior.

# CLOSE ISSUES

For each issue whose branch was merged:

1. Fetch the issue body with `gh issue view <ID> --json body`.
2. Check off every acceptance criterion that the merged code satisfies by
   changing that criterion's Markdown checkbox from `- [ ]` to `- [x]`.
3. Do not check off a criterion unless the merged code and validation output
   demonstrate that it is complete.
4. Preserve all other issue body content.
5. Update the issue body with `gh issue edit <ID> --body-file <file>`.
6. Close the issue with `gh issue close <ID> --comment "<comment>"`, listing
   only validation commands that were actually run and passed. Do not use
   `gh issue close --comment-file`; `gh issue close` does not support that flag.
   For a multi-line close comment, pass the comment text through `--comment`
   using shell quoting or command substitution.

```text
Completed by Sandcastle.

Verified:
- pnpm format
- pnpm format:check
- pnpm check:repo-styles
- pnpm check:file-tokens
- pnpm typecheck
- pnpm test
- pnpm test:db
- pnpm build
```

Here are all the issues:

{{ISSUES}}

Once you've merged everything you can, output <promise>COMPLETE</promise>.
