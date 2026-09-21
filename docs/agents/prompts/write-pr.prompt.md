# Prompt skeleton — Write PR (single issue)

> Genericized starting point for the **write-pr** agent. Single-pass (`runWithRetry`):
> the output IS the work; no implementation, no tests. See the spec:
> [§4.2 Implement](../afk-agent-platform-spec.md#42-implement-single-issue).
>
> _Vendored from `mattpocock/course-video-manager`; adapted to this repo (base branch `master`).
> See [`afk-vendored-assets.md`](../afk-vendored-assets.md)._

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
  "prDescription": "The problem, in one or two sentences.\n\nThe fix, in a short paragraph or a few bullets.\n\nCloses #{{ISSUE_NUMBER}}"
}
</output>
```

- `prTitle`: single line, < 70 chars, conventional-commit style, in English
  (`CODING_STANDARDS.md` § Code Language).
- `prDescription` follows `docs/agents/pull-requests.md` § Body. The reviewer has the diff and
  the issue open, so:
  - open with the problem in one or two sentences, then the fix in a short paragraph or a few
    bullets. No `## Summary` heading, no subsections;
  - do not restate the issue: its investigation, alternatives and domain reasoning stay there;
  - add a `Validation:` line only for what the commit messages say was run. You ran nothing, so
    never claim a command yourself; with nothing to report, leave the line out;
  - end with `Closes #{{ISSUE_NUMBER}}` so the PR closes the issue on merge.
