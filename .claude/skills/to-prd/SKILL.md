---
name: to-prd
description: Turn the current conversation into a PRD and publish it as a GitHub issue ready to receive sub-issues from /to-issues — no interview, just synthesis of what you've already discussed. AFK-native variant of the global /to-spec, adapted for this repo's PRD-as-parent-issue + native sub-issues + agent:implement workflow.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a
PRD (you may know this document as a spec), then publishes it as a **parent GitHub issue** in
this repo. It does **not** apply any `agent:*` label — dispatch is a deliberate human act
(see [afk-setup.md → Despacho](../../../docs/agents/afk-setup.md#despacho-de-ready-for-agent-triage-al-trigger-agent)).

Do NOT interview the user — just synthesize what you already know from the conversation. If
context is thin, ask the user to talk through the problem first; don't run the skill on an
empty plate.

The issue tracker is GitHub via `gh` — see [issue-tracker.md](../../../docs/agents/issue-tracker.md).

## Process

1. **Explore the repo** to understand the current state of the codebase, if you haven't
   already. Use the project's domain glossary (`CONTEXT.md`, [`docs/agents/domain.md`](../../../docs/agents/domain.md))
   throughout the PRD, and respect the ADRs under `docs/adr/` for any area you're touching.
   Follow [`.sandcastle/CODING_STANDARDS.md`](../../../.sandcastle/CODING_STANDARDS.md) and,
   for frontend/UI, [`style-guide.md`](../../../docs/agents/style-guide.md).

2. **Sketch the seams** at which you'll test the feature. A seam is a boundary where you can
   substitute behaviour to test in isolation — a deep module encapsulating a lot of
   functionality behind a simple, testable interface is the ideal seam. Prefer existing seams
   to new ones, and use the highest seam possible; the fewer seams across the codebase, the
   better — the ideal number is one. If new seams are needed, propose them at the highest
   point you can.

   Check with the user that these seams match their expectations, and which modules they want
   tests written for.

3. **Write the PRD** using the template below and publish it via `gh issue create` (heredoc
   for the body). Add **no labels** unless the user asks — in particular do **not** apply
   `agent:implement` (premature: no sub-issues exist yet) nor `agent:to-issues` (that would
   fire the unattended decomposition workflow; here we're decomposing interactively next).

4. **Output the issue URL** so the user can pass it to `/to-issues` next.

## PRD template

The PRD will be read by:

- **Humans** deciding whether the plan is sound.
- **`/to-issues`** (and the unattended `agent:to-issues` workflow) when breaking it into
  sub-issues.
- The **PRD-mode implement workflow** (`agent-implement-prd.yml`) at the start of each
  sub-issue run — the prompt pulls in the PRD body for context.
- The **review workflow** (`agent-review.yml`) when checking "does the PR match the spec?".

So the PRD must be a _spec_, not a sketch — concrete enough that a sub-issue agent can
implement against it without re-deriving decisions.

<prd-template>

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each in the format:

1. As a &lt;actor&gt;, I want &lt;feature&gt;, so that &lt;benefit&gt;

This list should be extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions, including:

- The modules to build/modify and the interfaces of those modules
- The seams at which the feature will be tested
- Technical clarifications from the developer
- Architectural decisions (respecting existing ADRs; note any new ADR that's implied)
- Schema changes
- API contracts
- Specific interactions

Do **not** include specific file paths or code snippets. They go stale fast.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose
can (state machine, reducer, schema, type shape), inline it within the relevant decision and
note that it came from a prototype. Trim to the decision-rich parts.

## Testing Decisions

- What makes a good test in this codebase (only external behaviour at a seam, not
  implementation details)
- Which modules/seams will be tested
- Prior art (similar tests in the codebase). DB tests run on PGlite in-process; real Postgres
  is left to the PR's CI.

## Out of Scope

Things explicitly excluded from this PRD. Be specific — "we are not building X" rather than
"X is out of scope."

## Further Notes

Anything else worth recording: open questions, known risks, deferred decisions.

</prd-template>

## After publishing

Tell the user:

> PRD published at &lt;URL&gt;. Next: run `/to-issues &lt;issue-number&gt;` to break it into
> ordered sub-issues, then add `agent:implement` to the PRD to start work. (Alternatively,
> label the PRD `agent:to-issues` to let the unattended workflow decompose it in CI.)

Do **not** add `agent:implement` yourself. The PRD has no sub-issues yet, so labeling it now
would run it as a standalone leaf and do unexpected work. The human labels once sub-issues are
in place.
