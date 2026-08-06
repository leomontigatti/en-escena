# Prompt skeleton — Implement (single issue)

> Genericized starting point for the **implement** agent. No structured output. The
> orchestrator asserts ≥1 commit afterwards. See the spec:
> [§4.2 Implement](../afk-agent-platform-spec.md#42-implement-single-issue).
>
> _Vendored from `mattpocock/course-video-manager`; adapted to this repo (commands, context
> docs). See [`afk-vendored-assets.md`](../afk-vendored-assets.md)._

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

- If you changed code mapped in `app/lib/shared/doc-map.json` (`app/lib/auth/**` →
  `docs/domain/access.md`; `app/lib/storage/**` and
  `app/lib/portal/choreography-music.server.ts` → `docs/operations/infrastructure.md`),
  either update that document or add a `Doc-Change-Not-Needed: <reason>` trailer to a
  commit. CI's `docs-gate` fails the PR otherwise, and you cannot read check output.
  Check with `pnpm check:doc-map`; the rule is in `.sandcastle/CODING_STANDARDS.md`.
- Do **not** push the branch — the workflow handles it.
- Do **not** close the issue — the merged PR handles it.
