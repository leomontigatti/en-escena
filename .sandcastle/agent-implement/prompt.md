<!--
  Runtime prompt for the **implement** runner (spec §4.2). Derived from the
  vendored skeleton docs/agents/prompts/implement.prompt.md; kept beside the
  runner because that's the artifact the runner loads. No structured output —
  the orchestrator asserts ≥1 commit afterwards.
-->

# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from the base branch (`master`).

The full issue is embedded below — it is your **complete source of truth**. You have **no
GitHub access** (no token, by design): do **not** run `gh` in any form, do not read or query
the tracker, and do not try to re-fetch or re-verify the issue. If something seems missing,
work from what is here; do not go looking for it with `gh`.

<issue number="{{ISSUE_NUMBER}}" title="{{ISSUE_TITLE}}">
{{ISSUE_BODY}}
</issue>

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

Before committing, run `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:db <path>` for the DB
test files you touched, and fix anything they surface. Don't run the full `pnpm test` — it takes
~13 min of your 30 min budget and CI runs the complete suite in parallel anyway. See
`.sandcastle/VALIDATION.md`.

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
- Do **not** touch the tracker or the remote in any way; you have no GitHub write access.

# WHEN YOU ARE DONE

The moment your commits are on `{{BRANCH}}` and the working tree is clean, you are
**finished**. Emit a one-line summary of what you committed, then output the literal
completion signal on its own line:

```
<promise>COMPLETE</promise>
```

This signal ends the run. Emit it **as soon as** the work is committed — do **not** re-verify
against the tracker, do **not** loop re-running `git status` / `git log` / `gh` to
double-check, and do **not** make empty or redundant commits first. Looping to re-confirm
already-committed work instead of emitting the signal is the exact failure this prevents.

Do **not** output `<promise>COMPLETE</promise>` unless the work really is committed on
`{{BRANCH}}`; if you genuinely cannot complete the issue, explain why and stop without emitting
it (the run will end at the iteration limit and be marked failed).
