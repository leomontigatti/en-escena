<!--
  Runtime prompt for the **write-pr** runner (spec §4.2). Derived from the
  vendored skeleton docs/agents/prompts/write-pr.prompt.md. Single-pass: the
  <output> block IS the work — no implementation, no tests.
-->

# TASK

Write the title and description for a pull request that closes issue #{{ISSUE_NUMBER}}:
{{ISSUE_TITLE}}.

The implementation is already done — commits sit on branch `{{BRANCH}}`. You are **not**
implementing anything and **not** running tests. You are summarising work that already
exists.

# CONTEXT

Read the issue with `gh issue view {{ISSUE_NUMBER}} --comments`, then read what changed on the
branch:

```
git log master..{{BRANCH}} --reverse
git diff master..{{BRANCH}} --stat
git diff master..{{BRANCH}}
```

If the diff is large, lean on commit messages and `--stat`; only `git diff` specific files
when a message is unclear.

# OUTPUT

Emit a single `<output>` block as the **last thing** in your response:

```
<output>
{
  "prTitle": "feat: short imperative summary",
  "prDescription": "## Summary\n\n- bullet 1\n- bullet 2\n\nCloses #{{ISSUE_NUMBER}}"
}
</output>
```

- `prTitle`: single line, < 70 chars, conventional-commit style.
- `prDescription`: must include `Closes #{{ISSUE_NUMBER}}` so the PR closes the issue on merge.
