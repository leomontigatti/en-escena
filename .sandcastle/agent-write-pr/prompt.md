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
  "prDescription": "The problem, in one or two sentences.\n\nThe fix, in a short paragraph or a few bullets.\n\nCloses #{{ISSUE_NUMBER}}"
}
</output>
```

- `prTitle`: single line, < 70 chars, conventional-commit style.
- `prDescription`: read `docs/agents/pull-requests.md` § Body and write it in that shape. One
  rule is yours alone: you ran nothing, so a `Validation:` line may only report what the commit
  messages say was run; with nothing to report, leave the line out. End with
  `Closes #{{ISSUE_NUMBER}}` so the PR closes the issue on merge.
- Both are written in **English**, per `.sandcastle/CODING_STANDARDS.md` § Code Language.
  Spanish appears only inside backticks, as data (UI copy, route segments, `CONTEXT.md`
  vocabulary).
