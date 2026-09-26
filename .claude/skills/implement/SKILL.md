---
name: implement
description: "Implementation workflow: explore, test-first at agreed seams, validate, review, commit. Use when asked to build a feature, fix a bug, or change code in a local session."
---

<!--
  Started as the `do-work` skill vendored from mattpocock/course-video-manager; renamed and
  reshaped after `implement` in mattpocock/skills (TDD through the `tdd` skill, a closing
  `code-review`). Local, not pinned by skills-lock.json. Since ADR-0016 this is the only
  implementation workflow: the AFK implement runners were retired.
-->

# Implement

## 1. Explore

Read the issue or request, then `CONTEXT.md`, the ADRs under `docs/adr/` that touch the area, and
the test files beside the code you will change. Done when you can name the **seams**: the public
interfaces the behaviour will be tested through.

Take the seams from the ticket's **Test seams** when it has them. Otherwise propose them and
confirm with the user; in an unattended run, choose them and state them in the commit body. When
where a seam belongs is itself the question, call the Skill tool with "codebase-design". When the
change renames a domain term or edits `CONTEXT.md` or an ADR, call it with "domain-modeling".

## 2. Build test-first

Call the Skill tool with "tdd" and follow its loop at those seams: one failing test, the minimal
code to pass it, repeat.

- Code that touches the database: also follow [DB-TDD.md](DB-TDD.md).
- Reducers, state machines, multi-step flows: also follow [FRONTEND-TDD.md](FRONTEND-TDD.md).

Validate as you go: `pnpm typecheck` and the single test file for the slice
(`pnpm test:unit <path>`, `pnpm test:db <path>`) each time a slice goes green.

## 3. Validate once at the end

Run the list in [`.sandcastle/VALIDATION.md`](../../../.sandcastle/VALIDATION.md): `pnpm typecheck`,
`pnpm lint`, `pnpm test:unit`, and `pnpm test:db <path>` for the DB test files you touched. Fix and
re-run each until it is clean before moving to the next. CI owns the full `pnpm test`.

## 4. Review

Call the Skill tool with "code-review" on the changes since the branch point. Fix what it finds,
then repeat step 3 for anything you touched. Refactoring belongs here, under green tests.

## 5. Commit

Commit to the current branch when the user asked for a commit or the run is unattended; otherwise
report the result and leave the tree for the user. Conventional-commit subject and body in
English, per `.sandcastle/CODING_STANDARDS.md` § Code Language.
