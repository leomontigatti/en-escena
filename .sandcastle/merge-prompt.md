# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After resolving conflicts, run `npm run format:check`, `npm run typecheck`, and `npm run test` to verify everything works. Also run `npm run test:db` if the merged branch touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules. Run `npm run build` if the merged branch touches routing, server rendering, bundling, CSS, or deployment behavior
4. If validation fails, fix the issue and rerun the same command before proceeding to the next command or branch

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each issue whose branch was merged:

1. Fetch the issue body with `gh issue view <ID> --json body`.
2. Check off every acceptance criterion that the merged code satisfies by
   changing that criterion's Markdown checkbox from `- [ ]` to `- [x]`.
3. Do not check off a criterion unless the merged code and validation output
   demonstrate that it is complete.
4. Preserve all other issue body content.
5. Update the issue body with `gh issue edit <ID> --body-file <file>`.
6. Close the issue using the following command:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Here are all the issues:

{{ISSUES}}

Once you've merged everything you can, output <promise>COMPLETE</promise>.
