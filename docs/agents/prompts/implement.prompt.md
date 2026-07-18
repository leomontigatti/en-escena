# Prompt skeleton — Implement (single issue)

> Genericized starting point for the **implement** agent. No structured output. The
> orchestrator asserts ≥1 commit afterwards. See the spec:
> [§4.2 Implement](../afk-agent-platform-spec.md#42-implement-single-issue).
>
> _Vendorizado de `mattpocock/course-video-manager`; adaptado a este repo (comandos, docs de
> contexto). Ver [`afk-vendored-assets.md`](../afk-vendored-assets.md)._

---

# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from the base branch (`master`). Pull in the
issue with `gh issue view {{ISSUE_NUMBER}} --comments`. If it has a parent PRD, pull that in
too.

# CONTEXT

Read the repo's domain/architecture docs before starting: `CONTEXT.md`, `docs/adr/`, and
[`docs/agents/domain.md`](../domain.md). Follow the coding standards in
`.sandcastle/CODING_STANDARDS.md` (and [`docs/agents/style-guide.md`](../style-guide.md) for
frontend/UI). Explore the repo and fill your context with the parts relevant to this issue —
especially test files that touch the area you'll change.

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
