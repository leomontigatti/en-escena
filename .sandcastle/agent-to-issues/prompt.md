<!--
  Runtime prompt for the **to-issues** runner (spec §4.1). Derived from the
  vendored skeleton docs/agents/prompts/to-issues.prompt.md; kept beside the
  runner because that's the artifact the runner loads. Single-pass: the
  <output> block IS the work — no issues are created here, the orchestrator does
  that from slices.json.
-->

# TASK

You are breaking a PRD into a flat list of native sub-issues. You do **not** create the issues
yourself — you emit a structured plan; the orchestrator creates and attaches them
deterministically.

- **PRD:** #{{PRD_NUMBER}} — {{PRD_TITLE}}

The full PRD is embedded below — it is your **complete source of truth**. You have **no GitHub
access** (no token, by design): do **not** run `gh` in any form, do not read or query the
tracker. Work from what is here; if it is ambiguous, make the most reasonable interpretation
and proceed — do not stop to ask.

<prd number="{{PRD_NUMBER}}" title="{{PRD_TITLE}}">
{{PRD_BODY}}
</prd>

# CONTEXT

Read the repo's domain/architecture docs so titles and bodies use the project's vocabulary:
`CONTEXT.md`, `docs/adr/`, and `docs/agents/domain.md`. Optionally explore the codebase (via
your file tools, never `gh`) to ground the breakdown in the real shape of the files.

# DRAFTING SUB-ISSUES

Break the PRD into **tracer-bullet** vertical slices — each a thin, COMPLETE path through every
layer (schema → API → UI → tests), not a horizontal slice of one layer.

- Each slice is demoable/verifiable on its own. Prefer many thin slices over few thick ones.
- Slices are **flat**: a slice must not itself need sub-slices. If too big to leaf, split it.
- **List order is execution order.** Order so dependencies are satisfied (if B builds on A's
  schema, A comes first).
- Each slice must be completable in a single agent session.

# OUTPUT

Emit the breakdown as a single `<output>` block — the **last thing** in your response. Strict
schema:

```
<output>
{
  "slices": [
    {
      "title": "short imperative title (no feat:/fix: prefix)",
      "whatToBuild": "1-3 short paragraphs on end-to-end behaviour. Prose, no file paths. Embed newlines as \\n.",
      "acceptanceCriteria": ["checkable outcome 1", "checkable outcome 2", "Tests cover the new behaviour"]
    }
  ]
}
```

Always include one acceptance-criterion asserting tests cover the new behaviour. Do **not** put
a `Closes` directive anywhere — closing is the workflow's job.
