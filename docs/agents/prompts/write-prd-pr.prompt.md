# Prompt skeleton — Write PR (whole PRD)

> Genericized starting point for the **write-prd-pr** agent. Single-pass (`runWithRetry`).
> The PR is reused across every sub-issue run, so describe the **whole PRD**, not one slice.
> See the spec: [§4.3 Implement PRD](../afk-agent-platform-spec.md#43-implement-prd).
>
> _Vendorizado de `mattpocock/course-video-manager`; adaptado a este repo (tracker `gh`). Ver
> [`afk-vendored-assets.md`](../afk-vendored-assets.md)._

---

# TASK

Write the title and description for a pull request that delivers PRD #{{PRD_NUMBER}}:
{{PRD_TITLE}}.

The PRD ships as a chain of sub-issue runs, all committing to the same branch. This PR is
reused across every run, so the title and description must describe the **whole PRD**, not
any individual sub-issue. You are **not** implementing anything.

# CONTEXT

Read the PRD and its sub-issues with `gh issue view <n> --comments`. Draft the title and
description framed around the whole effort.

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
- `prDescription`: restate the PRD's goal, list **every** sub-issue (number + title), and end
  with `Closes #{{PRD_NUMBER}}`.
