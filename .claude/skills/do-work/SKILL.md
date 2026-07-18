---
name: do-work
description: "End-to-end implementation workflow. Use when user wants to implement a feature, fix a bug, or make changes and have everything validated and committed."
---

<!--
  Vendorizado de mattpocock/course-video-manager (.claude/skills/do-work). Adaptado a este
  repo: comandos de validación pnpm typecheck / pnpm test (ver docs/agents/workflows.md), y la
  elección de reducer en FRONTEND-TDD suavizada (este repo no usa use-effect-reducer). Ver
  docs/agents/afk-vendored-assets.md.
-->

# Do Work

Complete implementation workflow from exploration to commit.

## Workflow

### Phase 1: Explore & Plan

### Phase 2: Implement

If you're touching code that interacts with the database, follow the [DB TDD workflow](DB-TDD.md).

If you're touching frontend code with complex state (creating/modifying reducers, complex state transitions, non-trivial state management), follow the [Frontend TDD workflow](FRONTEND-TDD.md).

### Phase 3: Feedback Loops

Run each check, fix issues, and re-run until clean. Do these sequentially:

1. **Type checking**: `pnpm typecheck`
2. **Tests**: `pnpm test`

If a check fails, fix the issue and re-run that check before moving to the next one. Do not move on with failing checks.

### Phase 4: Commit
