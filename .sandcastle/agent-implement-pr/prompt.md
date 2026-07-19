<!--
  Runtime prompt for the **implement-pr** runner (spec §4.5). Derived from the
  vendored skeleton docs/agents/prompts/implement-pr.prompt.md. Two-pass: the
  produce pass addresses feedback + commits; a separate extract pass emits the
  <output> block. The runner embeds the linked issue, the diff, and
  PR_COMMENTS_JSON below. Same fetched-context bundle as Review, but the job is to
  act on the conversation, not re-audit against the spec.
-->

# TASK

You are addressing reviewer feedback on PR #{{PR_NUMBER}} (branch `{{BRANCH}}`), linked to
issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.

Unlike a review, your job is **not** to compare the code against a spec or coding standards.
Read the unresolved conversation, decide what (if anything) to change, make those changes, and
explain yourself by replying where useful. You have **no** GitHub write access: do not push,
comment, label, or resolve anything. Commit locally; the workflow posts your output.

# CONTEXT

Read the repo's domain/architecture docs (`CONTEXT.md`, `docs/adr/`,
`docs/agents/domain.md`) **only if** a comment demands domain context — don't go deeper than
the comments require. Coding conventions live in `.sandcastle/CODING_STANDARDS.md`.

The linked issue, for context only:

<linked-issue>
Issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}
</linked-issue>

The current diff (`git diff master...HEAD`):

<diff-to-master>
{{DIFF}}
</diff-to-master>

The PR conversation (`PR_COMMENTS_JSON`), tagged by surface — `issue_comments` (top-level),
`review_threads` (unresolved inline threads; each comment has a `commentId` you can reply to),
`review_summaries` (submitted-review bodies). **Not everything here is actionable** — reviewers
leave context, questions, and asides. Unresolved ≠ must-action.

<pr-comments>
{{PR_COMMENTS_JSON}}
</pr-comments>

# PROCESS

1. **Classify each item**: code change needed / reply needed / neither.
2. **Make the code changes.** Run `pnpm typecheck` and `pnpm test` before committing; don't
   leave the branch broken. Conventional-commit messages, **no `RALPH:` prefix**. Making no
   change is fine — only commit when there's a real diff.
3. **Reply only where a reply adds value** (confirm what you changed, explain a decline, answer
   a question). Silence is fine for context-only comments. You **cannot** resolve threads —
   that's the reviewer's job.

# EXECUTION

When you have addressed the feedback and made any commit, output the literal completion signal
on its own line to end this pass:

```
<promise>COMPLETE</promise>
```

Emit it as soon as the work is done — do not loop re-checking. (The structured `<output>` block
below is requested separately, in a follow-up pass; you do not need to produce it now.)

# OUTPUT (extraction pass)

Emit a single `<output>` block as the **last thing** in your response:

```
<output>
{
  "threadReplies":     [ { "commentId": "<from a shown review_thread>", "body": "markdown" } ],
  "newInlineComments": [ { "path": "rel/path.ts", "line": 87, "body": "markdown" } ],
  "topLevelComments":  [ { "body": "markdown" } ]
}
```

- `threadReplies[].commentId`: must be from a shown `review_thread`; do not invent IDs.
- `newInlineComments`: only for lines in the diff (others are silently dropped); use when a
  thread reply isn't the right surface.
- `topLevelComments`: cross-cutting summaries not tied to a thread.
- An empty run (no commits **and** all three arrays empty) is treated as a failure.
- Do not add fields beyond those listed; the JSON is machine-parsed.
</output>
