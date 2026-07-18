# Prompt skeleton — Write PR (single issue)

> Genericized starting point for the **write-pr** agent. Single-pass (`runWithRetry`):
> the output IS the work; no implementation, no tests. See the spec:
> [§4.2 Implement](../afk-agent-platform-spec.md#42-implement-single-issue).
>
> _Vendorizado de `mattpocock/course-video-manager`; adaptado a este repo (rama base
> `master`). Ver [`afk-vendored-assets.md`](../afk-vendored-assets.md)._

---

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
