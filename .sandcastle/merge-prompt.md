# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After resolving conflicts, run `npm run format:check`, `npm run typecheck`, and `npm run test` to verify everything works. Also run `npm run test:db` if the merged branch touches database schema, repositories, loaders/actions that persist data, or persistence-backed business rules
4. If validation fails, fix the issue and rerun the same command before proceeding to the next command or branch

After all branches are merged, make a single commit summarizing the merge.

# CLOSE ISSUES

For each branch that was merged, close its issue using the following command:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Here are all the issues:

{{ISSUES}}

Once you've merged everything you can, output <promise>COMPLETE</promise>.
