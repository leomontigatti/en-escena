<!--
  Runtime prompt for the **update-branch** runner (spec §4.6). Derived from the
  vendored skeleton docs/agents/prompts/update-branch.prompt.md. Two-pass: the
  produce pass resolves the conflicts + finishes the merge commit; a separate
  extract pass emits the <output> block. The runner invokes this ONLY on the
  conflict path — the working tree is already in the conflicted state, and the
  runner embeds the PR view, git status, and the conflicting file list below.
-->

# TASK

PR #{{PR_NUMBER}} (branch `{{BRANCH}}`) has merge conflicts against its base `{{BASE_REF}}`.
A `git merge origin/{{BASE_REF}} --no-edit` has already been attempted and left the working
tree conflicted. Resolve every conflict, finish the merge, and write a PR comment describing
what you did. You have **no** GitHub write access: commit locally; the workflow pushes and
posts your comment.

# CONTEXT

Read the repo's domain/architecture docs (`CONTEXT.md`, `docs/adr/`, `docs/agents/domain.md`)
before resolving anything substantive.

The PR (`gh pr view {{PR_NUMBER}}`):

<pr-view>
{{PR_VIEW}}
</pr-view>

The merge state (`git status`):

<merge-status>
{{MERGE_STATUS}}
</merge-status>

The conflicting files (`git diff --name-only --diff-filter=U`):

<conflicting-files>
{{CONFLICTING_FILES}}
</conflicting-files>

# RESOLUTION POLICY

Always resolve. Do **not** abort the merge or leave a half-finished state. For each hunk:

1. **Investigate both sides' intent** before choosing — e.g. `git log -p --follow -- <path>` on
   both `origin/{{BASE_REF}}` and `{{BRANCH}}`; read commit messages; pull referenced issues.
2. **Preserve both intents** where possible. Where incompatible, pick the one matching the PR's
   stated goal and note the trade-off in your comment.
3. **Do not invent new behaviour.** This is reconciliation, not feature work. If a sensible
   resolution would need new logic on neither side, flag the uncertainty rather than improvise.

After resolving, run whatever checks you judge warranted (`pnpm typecheck` is fast and catches
most mistakes). If something's broken and you can't fix it, finish the merge anyway and flag it
clearly in the comment.

# COMMIT

Stage everything and finish the merge with a single commit (conventional-commit style, e.g.
`chore: merge origin/{{BASE_REF}} into {{BRANCH}}`). The workflow pushes whatever you commit.
Leave **no** unresolved files (`git diff --name-only --diff-filter=U` must be empty) — the run
fails otherwise.

When the merge is committed, output the literal completion signal on its own line to end this
pass:

```
<promise>COMPLETE</promise>
```

(The structured `<output>` block below is requested separately, in a follow-up pass.)

# OUTPUT (extraction pass)

Emit a single `<output>` block as the **last thing** in your response:

```
<output>
{ "comment": "Markdown PR comment: which conflicts existed, how you resolved each, and any uncertainty or remaining problems. Reference SHAs/paths where useful." }
</output>
```

The comment is the human author's only safety net — write it so they can spot a bad call in 30
seconds. Do not add fields beyond `comment`; the JSON is machine-parsed.
