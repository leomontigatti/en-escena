<!--
  Runtime prompt for the **write-prd-pr** runner (spec §4.3). Derived from the
  vendored skeleton docs/agents/prompts/write-prd-pr.prompt.md. Single-pass: the
  <output> block IS the work — no implementation, no tests. The PR is reused
  across every sub-issue run, so describe the WHOLE PRD, not one slice.
-->

# TASK

Write the title and description for a pull request that delivers PRD #{{PRD_NUMBER}}:
{{PRD_TITLE}}.

The PRD ships as a chain of sub-issue runs, all committing to branch `{{BRANCH}}`. This PR is
reused across every run, so the title and description must describe the **whole PRD**, not any
individual sub-issue. You are **not** implementing anything and **not** running tests.

The PRD and its sub-issues are embedded below — your **complete source of truth**. You have
**no GitHub access** (no token, by design): do **not** run `gh` in any form.

<prd number="{{PRD_NUMBER}}" title="{{PRD_TITLE}}">
{{PRD_BODY}}
</prd>

<sub-issues>
{{SUB_ISSUES}}
</sub-issues>

# CONTEXT

Read what has landed on the branch so far to ground the summary:

```
git log master..{{BRANCH}} --reverse
git diff master..{{BRANCH}} --stat
```

Lean on commit messages and `--stat`; only `git diff` specific files when a message is unclear.

# OUTPUT

Emit a single `<output>` block as the **last thing** in your response:

```
<output>
{
  "prTitle": "feat: short imperative summary of the PRD as a whole",
  "prDescription": "## Summary\n\nWhat the PRD delivers (1-3 paragraphs).\n\n## Sub-issues\n\n- #N — title\n- #M — title\n\nCloses #{{PRD_NUMBER}}"
}
</output>
```

- `prTitle`: single line, < 70 chars, conventional-commit style, framed around the PRD.
- `prDescription`: restate the PRD's goal, list **every** sub-issue (number + title from the
  embedded list above), and end with `Closes #{{PRD_NUMBER}}` so the PR closes the PRD on merge.
