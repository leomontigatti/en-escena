# Workflows

How work flows in a local session: where it starts, what a recommendation
needs, what this repo adds to the shared thread rules, and when a change needs a
doc change. How a rendered change is checked is [verification.md](verification.md).

## Where work starts

Implementation happens in a local T3 Code session (ADR-0016): a session has a
browser, the dev database and a human to ask. Three entry points, by how much is still unknown:

- **Small and clear** (a bug, a UI tweak, a one-slice feature): say it in the
  thread, or write the issue with what to build and its acceptance criteria and
  label it `ready-for-agent`. No PRD, no map. A session grabs it and runs the
  `implement` skill.
- **Clear but big** (known shape, several slices): `/grilling` until the shape
  and the test seams are agreed, `/to-spec` to file the PRD
  ([PRD workflow](./issue-tracker.md#prd-workflow)), `/to-tickets` to slice it into sub-issues
  ([Ticket operations](./issue-tracker.md#ticket-operations)), then
  `/implement-spec <PRD>`. The session runs every unblocked sub-issue at once in
  `implementer` subagents, merges each onto its branch and one draft PR,
  ticking each in the PR body's `## Sub-issues` list as it lands
  ([pull-requests.md](./pull-requests.md#prd-prs)), and reviews and babysits
  the chain once at the end: a resumed session reads the list, never the
  scrollback.
- **Foggy** (decisions nobody has made yet): `/wayfinder`. The map's tickets
  are grilling, research, prototype or task; a prototype is a throwaway
  artifact whose result is a decision on its ticket, never another PRD. The map
  ends with one or more PRDs, per the exit shapes in
  [issue-tracker.md](./issue-tracker.md#wayfinding-operations).

A request in the thread names the finish line and the allowed stops, so the
session knows when it is done and when to ask:

```
Implement #1234, open the PR and babysit it.
Done means: the acceptance criteria pass, a regression test cites the issue,
and the PR is ready to merge. Stop only if the seams are unclear.
```

The PR is reviewed in the session before it is opened (`implement` step 5) and
babysat afterwards by the same session, with the waiting done by T3's
`watch_pull_request` (`implement` step 7, then the `babysit-pr` skill).

## Investigate before recommending

Put a recommendation to the user only once the option you are ruling _out_ has
been researched as thoroughly as the one you are arguing _for_.

- **A recommendation that discards an option is a claim about that option.**
  Searching only the favoured branch and then re-searching when the
  recommendation is contested produces confident claims that get reversed a turn
  later.
- **Mark every claim as verified or inferred.** A statement about how the system
  behaves needs a `file:line` behind it. If there is none, say so explicitly
  instead of stating it flatly.
- **The docs are not evidence about the code.** They can be stale or contradict
  what is implemented; when a doc and the code disagree, the code is what the
  system does. Check both before building an argument on either, and report the
  divergence.
- **An architecture proposal** starts from the open architecture issues, so it
  duplicates none, and names one high-leverage change in the `codebase-design`
  skill's vocabulary rather than a list of cosmetic refactors.

## This repo's worktrees

The rules for branches, worktrees, T3 threads and investigating before editing are the shared
`implement` skill's `THREADS.md`. What this repo adds:

- `t3.json`'s `runOnWorktreeCreate` script links `.env` from the main checkout, installs and
  generates route types; in the main checkout (a "local" thread) it does nothing. T3 runs it only
  once it is imported (project settings → Actions → Import from t3.json), once per T3 install.
- A worktree's own database and dev port come later, on its first `pnpm dev`, `db:seed` or
  `db:migrate` ([local-auth.md](../local-auth.md#one-database-per-worktree)). `pnpm dev:info`
  reports the state ([verification.md](verification.md#doctor)).
- The default branch is `master`; `housekeeping` runs `pnpm worktree:sweep`
  ([housekeeping.md](housekeeping.md)).

## Documentation

Most code changes need no documentation change: agents and maintainers read the code. Before
adding a paragraph anywhere under `docs/`, ask what a maintainer or a later session would get
wrong without it. If reading the relevant code answers the question, leave it out.

- `docs/agents/` holds operative rules and the traps that are hard to discover from the source.
  `docs/domain/` holds the model, and `check:doc-map` fails a PR that changes mapped code without
  touching its page or carrying a `Doc-Change-Not-Needed: <reason>` commit trailer
  ([coding-standards.md](coding-standards.md#documentation-gate)).
  `docs/adr/` holds decisions and their reasons.
- Do not enumerate fields or functions, narrate control flow, keep file catalogs, or append PR
  summaries. Types, tests and code already record the implementation. A local explanation goes
  in a nearby code comment; a doc page is for reasoning that crosses boundaries.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not
  append a second account of the new behaviour. ADRs are the exception: they are records, so a
  change is a dated amendment section, and a reversal is a new ADR that supersedes.
- A session's plan, research notes and scratch files stay out of the repo. The issue and the PR
  are the record of the work ([pull-requests.md](./pull-requests.md#prd-prs)). Only a plan that
  has to outlive its session is committed, as `docs/plans/<kebab-name>.md`, never under `docs/agents/`,
  and is deleted when its work lands: the decisions it produced move to an ADR or to the
  operative page that owns them. Research that is a durable primary source goes under
  `docs/research/` per [issue-tracker.md](./issue-tracker.md#research-tickets).
