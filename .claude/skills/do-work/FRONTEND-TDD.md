<!--
  Vendorizado de mattpocock/course-video-manager (.claude/skills/do-work/FRONTEND-TDD.md).
  Adaptado: la fuente manda usar `useEffectReducer` de `use-effect-reducer`; este repo no usa
  esa librería (ni reducers hoy), así que la sección "Reducer choice" queda neutral respecto de
  la librería. El principio — extraer la lógica de estado a un módulo puro y testeable — se
  mantiene. Ver docs/agents/afk-vendored-assets.md.
-->

When your change touches frontend code involving complex state, use this TDD workflow.

## When to use this

- Creating or modifying a reducer
- Adding complex state transitions or derived state logic
- Any frontend logic with non-trivial state management

## Reducer choice

This repo does not currently prescribe a reducer library. If a change introduces one, keep the
state logic in a pure, testable module (below) regardless of the reducer primitive chosen, and
record the choice in an ADR (`docs/adr/`) if it becomes a repo-wide convention.

## Workflow

### 1. Extract state logic into a pure, testable module

Separate the state logic (reducer, state transitions, helpers) from the component. Place it in its own file (e.g., `my-feature-reducer.ts`) so it can be tested without React.

### 2. Write a SINGLE failing test

Test the state logic directly: given a state and an action/input, assert on the returned state. Place the test file next to the module (e.g., `my-feature-reducer.test.ts`).

### 3. Make it pass with the simplest implementation

Write just enough logic to make the failing test green. Don't anticipate future actions or edge cases yet.

### 4. Repeat 2 & 3 until all actions and edge cases are covered

Each new test should target one action or one edge case. Keep the red-green cycle tight — one test at a time, never batch.

### 5. Refactor under green tests

Once all behavior is covered, clean up: extract helpers, simplify switch arms, improve types. Run tests after every change to confirm nothing breaks.

### 6. Wire into the component

Only after the state logic is fully tested and green, integrate it into the component. The component layer should be thin — dispatch actions, render state.
