# `.sandcastle/` — the Architecture Review runner

This directory holds the one surviving AFK agent runner: Architecture Review,
invoked weekly by `.github/workflows/architecture-review.yml`. It implements the
**orchestrator↔runner split** of the AFK platform spec
(`docs/agents/afk-agent-platform-spec.md`, §3.8/§3.9): the workflow
(orchestrator) owns every tracker mutation and prefetches context; the runner
holds no GitHub token and only emits plain/JSON files under `OUTPUT_DIR`.

Every other runner was retired in ADR-0016 and its amendments: code is written,
reviewed and sliced into tickets in local T3 Code sessions. The rules those
sessions follow live in `docs/agents/`, not here — the coding standards in
`docs/agents/coding-standards.md` and the validation list in
`docs/agents/validation.md`.

## Layout

- `agent-architecture-review/` — the runner and its prompt.
- `lib/` — runner helpers (`runner.mts`, `run-with-extraction.mts`, `gh.mts`, …).
- `retry-feedback.mts` — the retry feedback `run-with-extraction.mts` builds.

The runner runs on the GitHub Actions host with `noSandbox()` (see
`lib/runner.mts`); it needs no local `.env` and no Docker image. Auth and tokens
come from GitHub Actions secrets — see `docs/agents/afk-setup.md`.
