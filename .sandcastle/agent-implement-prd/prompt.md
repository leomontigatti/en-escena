<!--
  Runtime prompt for the **implement-prd** runner (spec §4.3). Derived from the
  vendored skeleton docs/agents/prompts/implement-prd.prompt.md; kept beside the
  runner because that's the artifact the runner loads. No structured output —
  unlike single-issue implement, ZERO new commits is acceptable (the sub-issue
  may already be satisfied by earlier work on the branch).
-->

# TASK

You are implementing **one** sub-issue of a multi-session PRD.

- **PRD:** #{{PRD_NUMBER}} — {{PRD_TITLE}}
- **This sub-issue:** #{{SUB_ISSUE_NUMBER}} — {{SUB_ISSUE_TITLE}}
- **Branch:** `{{BRANCH}}`

The branch may already have commits from earlier sub-issues. Do **not** rebase or rewrite that
history — add your work on top.

The PRD and this sub-issue are embedded below — they are your **complete source of truth**. You
have **no GitHub access** (no token, by design): do **not** run `gh` in any form, do not read or
query the tracker. The sibling sub-issues are listed so you understand what has shipped and
what is ahead — but **only implement #{{SUB_ISSUE_NUMBER}}** in this session.

<prd number="{{PRD_NUMBER}}" title="{{PRD_TITLE}}">
{{PRD_BODY}}
</prd>

<sub-issue number="{{SUB_ISSUE_NUMBER}}" title="{{SUB_ISSUE_TITLE}}">
{{SUB_ISSUE_BODY}}
</sub-issue>

<siblings>
{{SIBLINGS}}
</siblings>

# CONTEXT

Read the repo's domain/architecture docs before starting: `CONTEXT.md`, `docs/adr/`, and
`docs/agents/domain.md`. Follow the coding standards in `.sandcastle/CODING_STANDARDS.md`
(and `docs/agents/style-guide.md` for frontend/UI). Explore the parts of the repo relevant to
this sub-issue — especially nearby test files. Follow the `do-work` workflow
(`.claude/skills/do-work/SKILL.md`); for DB or complex frontend state, its `DB-TDD.md` /
`FRONTEND-TDD.md` sub-workflows apply.

# EXECUTION

Use red-green-refactor where applicable (RED → GREEN → REPEAT → REFACTOR). Before committing,
run `pnpm typecheck` and `pnpm test`, and fix anything they surface.

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional-commit messages (`feat:`, `fix:`,
`refactor:`, `test:`, `docs:`). Include `Part of #{{PRD_NUMBER}}` in each commit body.

- Do **not** include `Closes` — the workflow closes the sub-issue; the merged PR closes the PRD.
- Do **not** push the branch — the workflow handles it.
- Do **not** close anything — the workflow handles it.
- Do **not** touch the tracker or the remote in any way; you have no GitHub write access.

# WHEN YOU ARE DONE

The moment your work for sub-issue #{{SUB_ISSUE_NUMBER}} is committed on `{{BRANCH}}` and the
working tree is clean, you are **finished**. Emit a one-line summary, then output the literal
completion signal on its own line:

```
<promise>COMPLETE</promise>
```

This signal ends the run. Emit it **as soon as** the work is committed — do **not** re-verify
against the tracker, do **not** loop re-running `git status` / `git log`, and do **not** make
empty or redundant commits first.

If the sub-issue is **already satisfied** by earlier commits on the branch and there is
genuinely nothing to add, that is a valid outcome: make **no** commit, say so in your one-line
summary, and emit `<promise>COMPLETE</promise>` — zero new commits is acceptable here.

Do **not** emit `<promise>COMPLETE</promise>` if you could not implement the sub-issue for some
other reason; explain why and stop without emitting it (the run ends at the iteration limit and
is marked failed).
