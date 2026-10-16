# Test-first notes: state machines and multi-step UI flows

What the shared `tdd` skill needs to know about this stack when a change adds complex state to
the frontend: a reducer, state transitions, derived state, a multi-step flow.

- **No reducer library is prescribed.** Keep the state logic in a pure module beside the
  component (`my-feature-reducer.ts`, tested by `my-feature-reducer.test.ts` with no React),
  whatever primitive holds it. A library adopted repo-wide is an ADR (`docs/adr/`).
- **The wired component is checked in the browser** (`docs/agents/verification.md`), not with a
  jsdom render that restates its markup. A component test earns its place only for a user flow
  whose outcome matters (what is submitted, what the user is told, what becomes disabled) or an
  accessibility contract: [coding-standards.md](coding-standards.md#component-tests).
- **Wait for the outcome**, never a fixed pause: `waitFor` from
  `app/lib/test-support/react-dom.tsx`. A test that shares the `unit-shared` worker resets the
  module state and the jsdom URL it touches
  ([validation.md](validation.md#a-test-that-fails-and-then-passes)).
