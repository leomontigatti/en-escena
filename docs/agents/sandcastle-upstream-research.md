# Sandcastle upstream research - 2026-07-03

## Scope

Question: compare the local En Escena Sandcastle integration with
<https://github.com/mattpocock/sandcastle> and identify upstream updates or
patterns worth adopting.

Primary sources used:

- Upstream repo: <https://github.com/mattpocock/sandcastle>
- Upstream README: <https://github.com/mattpocock/sandcastle/blob/main/README.md>
- Upstream changelog: <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>
- Upstream package manifest:
  <https://github.com/mattpocock/sandcastle/blob/main/package.json>
- Upstream template:
  <https://github.com/mattpocock/sandcastle/blob/main/src/templates/parallel-planner-with-review/main.mts>
- Upstream agent workflows:
  <https://github.com/mattpocock/sandcastle/tree/main/.sandcastle/agent-workflows>
- Local integration:
  [`package.json`](../../package.json),
  [`.sandcastle/main.mts`](../../.sandcastle/main.mts),
  [`.sandcastle/run-with-retry.mts`](../../.sandcastle/run-with-retry.mts),
  [`.sandcastle/README.md`](../../.sandcastle/README.md)

## Local baseline

- En Escena currently depends on `@ai-hero/sandcastle` `^0.10.0`.
  Source: [`package.json`](../../package.json).
- The local runner is not a stock template. It uses Codex, Docker,
  `createSandbox()`, bounded parallelism, single-issue mode, GitHub issue
  context, native parent issue context, isolated test database URLs, and custom
  merge behavior.
  Source: [`.sandcastle/main.mts`](../../.sandcastle/main.mts).
- The local planner already has a custom structured-output retry helper around
  `Output.object`.
  Source: [`.sandcastle/run-with-retry.mts`](../../.sandcastle/run-with-retry.mts).
- The local docs now describe GitHub native sub-issues as executable
  implementation units under parent PRDs.
  Source: [`.sandcastle/README.md`](../../.sandcastle/README.md).

## Upstream snapshot

- Upstream `main` currently publishes `@ai-hero/sandcastle` version `0.12.0`.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/package.json>.
- The public exports still include the core package plus Docker, Vercel,
  Podman, Daytona, and no-sandbox providers. That means an upgrade should not
  require import path changes for our current Docker usage.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/package.json>.
- The README documents `run()`, `createSandbox()`, `createWorktree()`,
  `branchStrategy`, file/stdout logging, `verbose` logging, and
  `completionTimeoutSeconds`.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/README.md>.
- The upstream parallel planner with review still follows the same broad shape:
  planner, per-issue implementer plus reviewer in one sandbox, then merger.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/src/templates/parallel-planner-with-review/main.mts>.

## Findings

### 1. Upgrade candidate: 0.10.0 -> 0.12.0

Upstream 0.11.0 and 0.12.0 contain changes that map directly to our local
customizations:

- `Output.object` and `Output.string` now accept `maxRetries` for structured
  output retry. The changelog says this works with resumable providers including
  `codex`.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>.
- `sandbox.run()` can resume sessions inside an existing long-lived
  `createSandbox()` container via `resumeSession`, `.resume()`, and `.fork()`.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>.
- `createSandbox()` exposes `sandbox.exec(command, options?)`, which lets the
  orchestrator run shell verification inside the same warm sandbox between
  agent phases.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>.
- 0.12.0 fixes file-mode logging so streamed text is written contiguously and
  structured log entries start on fresh lines.
  Source:
  <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>.

Recommendation: upgrade Sandcastle as a separate implementation issue, then
validate the runner with `pnpm typecheck` and one controlled `pnpm sandcastle`
single-issue dry run. Keep the local runner; do not replace it with the stock
template.

### 2. Replace local structured-output retry after upgrade

Our custom helper exists because `Output.object` used to throw
`StructuredOutputError` without native retry. Upstream 0.11.0 now supports
`maxRetries` and resumes the failed session with a compact validation error.

Local source: [`.sandcastle/run-with-retry.mts`](../../.sandcastle/run-with-retry.mts).
Upstream source:
<https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>.

Recommendation: after the dependency upgrade, replace `runWithRetry(...)` in
the planner with `Output.object({ tag: "plan", schema: planSchema, maxRetries:
2 })`, then delete the local helper only if behavior matches. This reduces
local maintenance without changing the planner prompt.

### 3. Add orchestrator-owned verification between implementer and reviewer

The local flow already keeps implementer and reviewer in one sandbox per
branch. Upstream 0.12.0 adds `sandbox.exec()`, so the orchestrator can run a
cheap command before the reviewer starts.

Local source: [`.sandcastle/main.mts`](../../.sandcastle/main.mts).
Upstream source:
<https://github.com/mattpocock/sandcastle/commit/0f577a4>.

Candidate use:

- Run a configurable post-implement command, for example a focused test or
  `pnpm typecheck`, before invoking the reviewer.
- Feed the command result into the reviewer prompt or fail the issue pipeline
  early when the command fails.
- Keep it configurable because running full validation for every parallel issue
  can be expensive.

Repo rule: if TypeScript validation is used, the command must be
`pnpm typecheck`, not `pnpm exec tsc`.
Sources: [CLAUDE.md](../../CLAUDE.md) and
[`docs/agents/workflows.md`](workflows.md).

### 4. Improve diagnostics with logging and completion timeouts

The upstream README documents `logging.verbose` and
`completionTimeoutSeconds`. The changelog also includes the 0.12.0 file logging
fix.

Sources:

- <https://github.com/mattpocock/sandcastle/blob/main/README.md>
- <https://github.com/mattpocock/sandcastle/blob/main/CHANGELOG.md>

Recommendation: add a local debug switch, for example an env var, that enables
`logging: { type: "file", verbose: true }` for planner, implementer, reviewer,
and merger runs. Also consider setting `completionTimeoutSeconds` explicitly on
long-running agents, because the README describes it as the grace window after a
completion signal when a child process keeps stdout open.

### 5. Check `branch` versus `branchStrategy` before upgrading

The upstream README documents `branchStrategy: { type: "branch", branch:
"agent/fix-42" }` for `run()`.
Source:
<https://github.com/mattpocock/sandcastle/blob/main/README.md>.

The local merger still calls top-level `sandcastle.run({ branch: TARGET_BRANCH,
... })`.
Source: [`.sandcastle/main.mts`](../../.sandcastle/main.mts).

Recommendation: before or during the upgrade, confirm whether top-level
`branch` is still accepted or whether the merger should become:

```ts
branchStrategy: { type: "branch", branch: TARGET_BRANCH },
```

`createSandbox({ branch })` remains used by the upstream template, so the
per-issue sandbox calls are less concerning.
Source:
<https://github.com/mattpocock/sandcastle/blob/main/src/templates/parallel-planner-with-review/main.mts>.

### 6. Do not wholesale replace our runner with upstream templates

The upstream `parallel-planner-with-review` template is useful as a reference,
but it is less tailored than the local runner for this repo. The upstream
template uses Claude defaults, generic prompt files, and unbounded
`Promise.allSettled` over planned issues. The local runner adds Codex setup,
bounded concurrency, GitHub token checks, issue context enrichment, sub-issue
support, custom database setup, single issue mode, and local merge handling.

Sources:

- Upstream template:
  <https://github.com/mattpocock/sandcastle/blob/main/src/templates/parallel-planner-with-review/main.mts>
- Local runner: [`.sandcastle/main.mts`](../../.sandcastle/main.mts)

Recommendation: cherry-pick APIs and patterns, not template files.

### 7. Agent workflows are useful references, not an immediate local fit

Upstream includes `.sandcastle/agent-workflows` for GitHub-style implement and
review automation. The review workflow uses `noSandbox()`, stdout logging, and
a shared `runWithExtraction` helper that first lets the agent produce work and
then resumes the session to extract structured output.

Sources:

- <https://github.com/mattpocock/sandcastle/blob/main/.sandcastle/agent-workflows/review/review.ts>
- <https://github.com/mattpocock/sandcastle/blob/main/.sandcastle/agent-workflows/implement/implement.ts>
- <https://github.com/mattpocock/sandcastle/blob/main/.sandcastle/agent-workflows/shared/run-with-extraction.ts>

Recommendation: keep these as references for future PR automation. They do not
replace the local Docker/Codex issue runner today.

## Suggested implementation issues

1. Upgrade Sandcastle to `0.12.0` and validate local API compatibility.
   Acceptance criteria: dependency and lockfile updated, top-level merger branch
   option audited, `pnpm typecheck` passes, one single-issue Sandcastle run gets
   through planner startup.
2. Replace `.sandcastle/run-with-retry.mts` with native `Output.object`
   `maxRetries` after the upgrade.
   Acceptance criteria: planner still retries malformed plan output, helper is
   deleted only if behavior is equivalent.
3. Add optional `sandbox.exec()` post-implement verification.
   Acceptance criteria: command is configurable, result is logged, failure
   either blocks review or is included in reviewer context.
4. Add a debug logging switch and explicit completion timeout.
   Acceptance criteria: normal logs remain concise, debug mode captures verbose
   provider output in `.sandcastle/logs`.

## Bottom line

The useful upstream value is in newer library APIs, not in replacing our local
workflow. The highest-value path is a narrow dependency upgrade to 0.12.0,
followed by deleting local retry code and adding orchestrator-owned verification
inside the warm sandbox.
