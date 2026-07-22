---
name: to-issues
description: Break a PRD into native GitHub sub-issues attached to the parent PRD, in execution order. AFK-native variant of the global /to-tickets, adapted for this repo's PRD-as-parent + native sub-issues + agent:implement multi-session workflow. Argument is the parent PRD issue number.
disable-model-invocation: true
---

# To Issues

Break a parent PRD into a **flat, ordered** list of native GitHub sub-issues. Each sub-issue is
a tracer-bullet vertical slice that the PRD-mode `agent:implement` workflow
(`agent-implement-prd.yml`) picks up one at a time, in list order, on a single shared branch.

This is the interactive/local twin of the unattended `agent:to-issues` workflow (see the
runner prompt [`docs/agents/prompts/to-issues.prompt.md`](../../../docs/agents/prompts/to-issues.prompt.md)
and [spec §4.1](../../../docs/agents/afk-agent-platform-spec.md#41-to-issues)). Both produce
the **same sub-issue shape** — this skill just lets you author them in a live session with the
user in the loop. The tracker is GitHub via `gh` — see
[issue-tracker.md](../../../docs/agents/issue-tracker.md).

## Inputs

- **Argument:** the parent PRD's issue number. If invoked without one, ask for it (or a URL).
- **Conversation context** (optional): any planning already done. Use it.

## Process

### 1. Fetch the PRD

```
gh issue view <PRD_NUMBER> --comments
```

Read the body carefully — the PRD is the spec. Don't add scope; don't redesign. If it's
ambiguous, ask the user to clarify _before_ drafting slices.

### 2. Confirm there are no existing sub-issues

```
gh api "repos/{owner}/{repo}/issues/<PRD_NUMBER>/sub_issues" --jq 'length'
```

(`gh` infers `{owner}/{repo}` from the clone's remote.) If non-zero, stop and ask the user
whether to (a) abort, (b) add more on top, or (c) close the existing ones first. Don't
silently double up.

### 3. Explore the codebase (optional)

If you haven't already, explore the repo to understand the area you're touching. Use the
domain glossary (`CONTEXT.md`, [`docs/agents/domain.md`](../../../docs/agents/domain.md)) and
respect the ADRs under `docs/adr/`. Sub-issue titles and bodies must use the project's
vocabulary. Follow [`.sandcastle/CODING_STANDARDS.md`](../../../.sandcastle/CODING_STANDARDS.md).

Look for prefactors that make the implementation easier: "make the change easy, then make the
easy change."

### 4. Draft vertical slices

Break the PRD into **tracer-bullet** sub-issues. Each slice is a thin vertical cut through
every layer (schema → API → UI → tests), NOT a horizontal slice of one layer.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer, demoable/verifiable on
  its own. Prefer many thin slices over few thick ones.
- Sub-issues are **flat** — a sub-issue must not itself need sub-issues. If a slice is too big
  to leaf, split it into peer slices instead of nesting.
- Any prefactoring goes first, in its own slice(s) at the start of the list.
- **List order is execution order.** Order slices so dependencies are satisfied: if slice B
  builds on slice A's schema, A comes first. There are no explicit "blocked-by" edges — order
  _is_ the dependency, because the workflow runs them top to bottom on one branch.
- Each slice must stand on its own in a single ~100K-token agent session — no slice may rely
  on state from a previous session beyond what's committed to the shared branch. A realistic
  session builds a couple of files, writes tests, and runs `pnpm typecheck` / `pnpm test`.
</vertical-slice-rules>

**Wide refactors are the exception to vertical slicing.** A wide refactor is one mechanical
change (rename a column, retype a shared symbol) whose blast radius fans across the codebase,
so no vertical slice can land green alone. Sequence it as **expand → migrate → contract**,
each phase its own slice, ordered so each keeps CI green because the old form still exists:
first an _expand_ slice (add the new form beside the old), then _migrate_ slices batched by
blast radius (per package/directory), then a final _contract_ slice (delete the old form). The
ordering carries the dependency — no blocking edges needed.

### 5. Quiz the user

Present the breakdown as a numbered list. For each slice show:

- **Title** — short, imperative (no `feat:`/`fix:` prefix)
- **What it builds** — one or two sentences
- **Comes after** — the earlier slice(s) it builds on (by position), or "nothing — can start immediately"

Ask: is the granularity right (too coarse / too fine)? is the order right? should any slices
be merged, split, or dropped? Iterate until the user approves.

### 6. Publish sub-issues to GitHub

Publish **in order** (this repo supports `--parent`, so no manual sub-issues API dance):

```
gh issue create \
  --title "<title>" \
  --parent <PRD_NUMBER> \
  --body "$(cat <<'EOF'
<body — see template>
EOF
)"
```

`--parent` records the native sub-issue link — it shows in the PRD's progress bar and is what
`agent-implement-prd.yml` reads to pick the next slice. Capture each new issue's number.

Do **not** apply `agent:implement` (or any `agent:*` label) to the sub-issues — they're never
labeled directly. Dispatch happens on the **PRD**.

### 7. Sub-issue body template

<sub-issue-template>
## Parent PRD

#&lt;PRD_NUMBER&gt;

## What to build

A concise description of this slice's end-to-end behaviour — one to three short paragraphs,
framed around what the slice _delivers_, not which files change. No file paths.

Exception: a prototype-derived snippet (state machine, reducer, schema, type shape) may be
inlined when prose can't encode the decision as precisely. Trim to the decision-rich parts.

## Acceptance criteria

- [ ] Concrete, checkable outcome 1
- [ ] Concrete, checkable outcome 2
- [ ] Tests cover the new behaviour

## Comes after

If this slice builds on an earlier sub-issue's work, name it (e.g. "Sub-issue #N — &lt;title&gt;").
If not, omit this section.
</sub-issue-template>

The body intentionally has **no `Closes` directive** — closing the sub-issue is the PRD-mode
workflow's job (at the end of its run). The PRD itself closes when the bundled PR merges via
`Closes #<PRD>` in the PR description.

Always include one acceptance criterion asserting tests cover the new behaviour.

## After publishing

Tell the user:

> Attached &lt;N&gt; sub-issues to PRD #&lt;PRD_NUMBER&gt; in execution order. Add
> `agent:implement` to the PRD when ready — the workflow implements sub-issues in order,
> accumulating commits on a single `agent/prd-<PRD_NUMBER>-…` branch, and opens a draft PR
> after the first sub-issue.

List order determines execution order. To reorder, drag in the GitHub UI before labeling, or
use `PATCH /repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority`. Do **not** close
or modify the parent PRD here.
