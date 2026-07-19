<!--
  Runtime prompt for the **implement** runner (spec §4.2). Derived from the
  vendored skeleton docs/agents/prompts/implement.prompt.md; kept beside the
  runner because that's the artifact the runner loads. No structured output —
  the orchestrator asserts ≥1 commit afterwards.
-->

# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from the base branch (`master`). Pull in the
issue with `gh issue view {{ISSUE_NUMBER}} --comments`. If it has a parent PRD, pull that in
too.

# CONTEXT

Read the repo's domain/architecture docs before starting: `CONTEXT.md`, `docs/adr/`, and
`docs/agents/domain.md`. Follow the coding standards in `.sandcastle/CODING_STANDARDS.md`
(and `docs/agents/style-guide.md` for frontend/UI). Explore the repo and fill your context
with the parts relevant to this issue — especially test files that touch the area you'll
change. Follow the `do-work` workflow (`.claude/skills/do-work/SKILL.md`); for DB or complex
frontend state, its `DB-TDD.md` / `FRONTEND-TDD.md` sub-workflows apply.

# EXECUTION

Use red-green-refactor where applicable:

1. RED: write one failing test
2. GREEN: implement to pass it
3. REPEAT until the issue is done
4. REFACTOR

Before committing, run `pnpm typecheck` and `pnpm test`, and fix anything they surface.

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional-commit messages
(`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).

- Do **not** push the branch — the workflow handles it.
- Do **not** close the issue — the merged PR handles it.
- Do **not** touch the tracker or the remote in any way; you have no GitHub write access.
