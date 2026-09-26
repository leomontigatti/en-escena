<!--
  Runtime prompt for the **architecture-review** runner (spec §4.8). Derived from
  the vendored skeleton docs/agents/prompts/architecture-review.prompt.md.
  Two-pass: the produce pass explores read-only; a separate extract pass emits the
  <output> block. Unattended scheduled run — no user to ask. The runner embeds the
  prior proposals below so the tokenless agent can dedupe.
-->

# TASK

You are running the periodic architecture-review pass. Find **one** fresh, high-leverage
deepening opportunity in this codebase and draft it as a PRD.

This is an unattended run — there is no user to grill. Your job:

1. Review the prior proposals below (open and closed) so you don't re-propose them.
2. Explore the codebase.
3. Pick **one** top candidate (deletion test, module deepening, glossary alignment — the repo's
   own architecture methodology).
4. Emit it as a structured PRD in the `<output>` block. The orchestrator publishes it — you do
   not.

# CONTEXT

Read the repo's domain/architecture docs and ADRs before proposing: `CONTEXT.md`, `docs/adr/`,
`docs/agents/domain.md`, and `.sandcastle/CODING_STANDARDS.md`. Treat recorded decisions (the
ADRs) as **binding** — do not propose anything that contradicts one.

Call the Skill tool with "codebase-design" before exploring: it is the vocabulary (module,
interface, depth, seam, leverage, locality) the candidates are judged and the PRD is written in.
When a candidate is a glossary alignment, call it with "domain-modeling" too.

Prior `source:architecture-review` proposals (do not re-propose these):

<prior-proposals>
{{PRIOR_PROPOSALS_JSON}}
</prior-proposals>

# RULES

- **Fully read-only** on the repo and the tracker. No commits, no edits, no issue creation. You
  only _draft_ the PRD and emit it as structured output — the orchestrator is the sole publisher.
- **One PRD per run.** If every reasonable candidate is already covered by a prior proposal,
  emit a `skipped` output and stop.
- Make the call yourself — there is no user to consult.
- **Report documentation drift you run into.** While exploring you read docs and code side by
  side. When a current-state document (`docs/domain/`, `docs/operations/`, `docs/agents/`,
  `CONTEXT.md`, `docs/local-auth.md`) states something the code you read contradicts, list it —
  document, the claim, the file that contradicts it — under a `### Documentation drift` heading
  at the end of **Further Notes**, or appended to `reason` on a `skipped` run. Do not go hunting
  for it, and do not let it displace the PRD. ADRs, superseded ADRs and finished plans are
  historical records: a file they name that no longer exists is not drift.

# PRD BODY TEMPLATE

The `body` you emit is the published PRD. It will be read by humans deciding whether the plan is
sound, by the `to-tickets` session that breaks it into sub-issues, by the session implementing
each sub-issue, and by the review checking "does the PR match the spec?". So
it must be a **spec, not a sketch** — concrete enough that a sub-issue agent can implement
against it without re-deriving decisions. Structure the `body` as:

```markdown
## Problem Statement

The problem, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A long, numbered list covering all aspects of the feature, each as:

1. As a <actor>, I want <feature>, so that <benefit>

## Implementation Decisions

Modules to build/modify and their interfaces; architectural decisions; schema changes; API
contracts; specific interactions. No file paths or code snippets (they go stale) — exception: a
prototype-derived snippet that encodes a decision more precisely than prose (state machine,
reducer, schema, type shape), trimmed to the decision-rich parts.

## Testing Decisions

What makes a good test here (external behaviour, not implementation details); the **test seams**
(the public interfaces each module is tested through), since the implement agent tests at these
and has nobody to confirm them with; prior art (similar tests in the codebase).

## Out of Scope

Things explicitly excluded — be specific ("we are not building X", not "X is out of scope").

## Further Notes

Open questions, known risks, deferred decisions.
```

# EXECUTION

When your exploration is complete, output the literal completion signal on its own line to end
this pass:

```
<promise>COMPLETE</promise>
```

(The structured `<output>` block below is requested separately, in a follow-up pass.)

# OUTPUT (extraction pass)

Emit a single `<output>` block, one of two shapes:

```
<output>
{
  "status": "proposed",
  "title": "PRD title (<= 256 chars)",
  "body": "The full PRD body, following the template above. Embed newlines as \\n.",
  "oneLineSummary": "One-line description of the deepening opportunity.",
  "candidatesConsidered": ["candidate 1", "candidate 2"]
}
</output>
```

```
<output>
{ "status": "skipped", "reason": "Why no new PRD (e.g. everything fresh is already covered)." }
</output>
```

Do not add fields beyond those listed; the JSON is machine-parsed.
