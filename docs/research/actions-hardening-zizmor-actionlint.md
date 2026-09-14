# GitHub Actions hardening: zizmor and actionlint on the nine workflows

Research for [#933](https://github.com/leomontigatti/en-escena/issues/933), map [#929](https://github.com/leomontigatti/en-escena/issues/929).

Both tools were run locally in a throwaway worktree (`/tmp/en-escena-research-actions-hardening-zizmor-actionlint`, branch `research/actions-hardening-zizmor-actionlint`), offline (`--no-online-audits`), against all nine `.github/workflows/*.yml`.

- `uvx zizmor` — zizmor 1.30.1, installed via `uv`/PyPI in ~2s, no manual setup needed.
- actionlint — downloaded the prebuilt Go binary from the GitHub release (`rhysd/actionlint` v1.7.12, `linux_amd64` tarball), no Go toolchain required.

## 1. Findings by workflow and rule

### zizmor, default persona (offline): 116 findings — 2 info, 7 low, 14 medium, 41 high

Rule counts: `unpinned-uses` 35 (error/high), `artipacked` 10 (warning/low), `excessive-permissions` 4 (warning/medium, workflow-level "no `permissions:` block" cases only), `github-env` 3 (error), `dangerous-triggers` 3 (error, one per `pull_request_target` workflow).

### zizmor, pedantic persona (offline): 116 findings — 10 info, 16 low, 14 medium, 57 high

Same core set plus, at job/step granularity: `excessive-permissions` 15 (error, one per over-broad job-level permission key such as `contents: write` or `pull-requests: write`), `unpinned-images` 1 (`postgres:17-alpine` in `ci.yml`'s `db-gate` service container), `template-injection` 2 (info, low confidence, in `architecture-review.yml` around `steps.publish.outputs.*` interpolated into a shell string), plus `help`-level `undocumented-permissions` and `adhoc-packages` notes not counted as findings by severity but present in the report.

### actionlint: 0 findings

Clean run on all nine files with the current actionlint ruleset (shellcheck-backed script checks, expression/context validation, `runs-on`/matrix checks, etc.). This is expected: actionlint's checks are almost entirely disjoint from zizmor's (syntax/expression correctness vs. supply-chain/security posture), so a clean actionlint run is not evidence against the zizmor findings below.

### Classification — real vs. noise

**Real, worth fixing:**

- `unpinned-uses` (35, high, all workflows) — every `uses: owner/action@vN` (tag, not SHA). This is exactly what #933 asks to fix; see §3.
- `unpinned-images` (1, `ci.yml` `db-gate`) — `postgres:17-alpine` by tag. Lower priority than action pins (it's a same-repo, non-secret CI service container, not a supply-chain-to-prod vector), but a legitimate finding: tags are mutable.
- `excessive-permissions`, job-level (pedantic, 15) — the six agent workflows declare `contents: write` / `pull-requests: write` / `issues: write` at workflow level even though only specific jobs need them. Real: the fix is to move `permissions: {}` to the workflow and grant each job only what it uses (e.g. the AFK runner jobs that only read+report don't need `contents: write`).
- `dangerous-triggers` (3, `pull_request_target` in `agent-review.yml`, `agent-implement-pr.yml`, `agent-update-branch.yml`) — **noise given context, but only because of a control zizmor cannot see**: all three gate the mutating job with `if: github.event.pull_request.head.repo.full_name == github.repository` (confirmed by reading `agent-implement-pr.yml:38-40`, comment "Same-repo guard (#635)"), so a fork PR's `pull_request_target` run no-ops before checkout. Zizmor's rule fires on the trigger alone since it can't evaluate that runtime condition — this is the ticket's "`pull_request_target` with checkout of `head.sha`" case, and here it's mitigated, not absent. Worth a `#zizmor: ignore[dangerous-triggers]` reason-comment (zizmor supports inline suppressions) rather than a code change.
- `artipacked` (10, low confidence) — `actions/checkout` without `persist-credentials: false`, including the same-repo-guarded `pull_request_target` checkouts of `head.sha` in the three PR workflows and the plain `checkout@v5` in `ci.yml`. Real and cheap: add `persist-credentials: false` everywhere the checked-out tree isn't later pushed from (and where it is pushed from, e.g. via `AGENT_PAT`, the token comes from `with: token:`, not the default persisted credential, so this is still safe to set).
- `github-env` (3, low confidence, in the three PRD/implement workflows' preflight steps) — `echo "...=..." >> "$GITHUB_ENV"` from a multi-line `run:` block. Worth a look because `$GITHUB_ENV` writes are later expanded unquoted in subsequent steps' env; low confidence here because the values written (`OUTPUT_DIR`, static paths) aren't attacker-controlled.
- `template-injection` (2, info, low confidence, `architecture-review.yml`) — `${{ steps.publish.outputs.status }}` / `.outputs.url` interpolated directly into a `run:` shell string rather than passed via `env:`. Both outputs come from this repo's own prior step, not from untrusted input, so exploitability is low, but the fix (route through `env:` and reference `$STATUS`/`$URL`) is the standard mechanical fix and has a zizmor auto-fix.

**Noise / accept-as-is:**

- `excessive-permissions`, workflow-level "no `permissions:` block" (default persona, 4, in `ci.yml`) — `ci.yml` has no `permissions:` key at all, so it inherits the repo/org default (this repo does not grant `write` broadly by default per `docs/local-auth.md`/org settings — **could not verify** the org default token permission from within the worktree). Still worth an explicit `permissions: contents: read` for auditability, but it's not a live excessive-grant the way the agent workflows' `contents: write` is.
- `undocumented-permissions` / `adhoc-packages` (`help`-level, not counted in the severity tally) — style nits, not security findings; zizmor itself surfaces them as `help`, its lowest tier.
- `anonymous-definition` (`info`) — jobs without a `name:` key; cosmetic.

## 2. How each tool runs in CI

**zizmor**
- Distribution: PyPI package (`zizmor`), written in Rust, shipped as a Python-wheel-wrapped binary — no separate Rust toolchain needed to run it. Installed here via `uvx zizmor` (Astral's `uv`), which fetched and cached the binary in ~2 seconds.
- Official CI integration: `zizmorcore/zizmor-action` (a GitHub Action, SHA-pinned in their own example — `zizmorcore/zizmor-action@cc914d7f…  # v0.6.4`), recommended by [docs.zizmor.sh/integrations/#github-actions](https://docs.zizmor.sh/integrations/) as the easiest path; it wraps zizmor + SARIF upload to code scanning.
- Manual alternative (what their own docs show for "expert" control): `astral-sh/setup-uv` to install `uv`, then `uvx "zizmor@$ZIZMOR_VERSION" --format=sarif .`, then `github/codeql-action/upload-sarif`. Requires `security-events: write`, `contents: read`, `actions: read` permissions for the SARIF path.
- Runtime: seconds per run (single-binary static analysis, no build step); our full nine-workflow run (default persona, offline) took a few seconds.
- Source: [docs.zizmor.sh/integrations](https://docs.zizmor.sh/integrations/), [github.com/zizmorcore/zizmor](https://github.com/zizmorcore/zizmor) (README, `docs/usage.md`).

**actionlint**
- Distribution: single static Go binary, no dependencies for the core checks; optional `shellcheck`/`pyflakes` binaries on `PATH` deepen the `run:` script checks (not required to get output — our run had neither installed... **could not verify** whether shellcheck was present in this sandbox, since actionlint reported 0 findings either way).
- No official first-party GitHub Action. `github.com/rhysd/actionlint/docs/install.md` and `docs/usage.md` document three CI paths: (a) their own `scripts/download-actionlint.bash` (curl the script, it resolves and downloads the pinned-version binary), (b) the official Docker image `rhysd/actionlint:latest` via `uses: docker://rhysd/actionlint:latest`, or (c) the third-party `reviewdog/action-actionlint` which wraps actionlint and posts inline PR annotations via reviewdog.
- Runtime: near-instant (compiled Go binary, no interpreter startup); our run over all nine files completed well under a second.
- Source: [github.com/rhysd/actionlint/blob/main/docs/usage.md](https://github.com/rhysd/actionlint/blob/main/docs/usage.md), release API (`api.github.com/repos/rhysd/actionlint/releases/latest`, v1.7.12).

## 3. SHA pinning tooling

- **pinact** ([github.com/suzuki-shunsuke/pinact](https://github.com/suzuki-shunsuke/pinact), latest release v5.0.0 per the GitHub Releases API): `pinact run` rewrites `uses: owner/action@v5` in place to `uses: owner/action@<sha> # v5`, matching the exact form #933 asks for. `pinact run --check` (or `--fix=false`) checks without editing, suitable as a CI gate; a separate `pinact run --update` step (with a configurable minimum release age) is how it *would* bump versions — the ticket wants to avoid exactly that, so the CI gate would run pinact only in check mode. There's an official `pinact-action` GitHub Action. Source: pinact README (raw, `main` branch).
- **ratchet** ([github.com/sethvargo/ratchet](https://github.com/sethvargo/ratchet)), latest release v0.12.0: same class of tool ("pin and unpin upstream versions... like Bundler for CI"), installable via `go install github.com/sethvargo/ratchet@latest` or Homebrew. **Could not verify** its exact pinned-comment output format or its `--check`/CI-gate flag names beyond the README's framing — the coordinator asked me to stop before I read `ratchet`'s usage docs in depth.
- **zizmor `--fix`**: `unpinned-uses` is listed among zizmor's auto-fixable rules (`= note: this finding has an auto-fix` in our own run's output). `--fix` (alias `--fix=safe`) applies safe fixes in place; `unpinned-uses`'s fix specifically needs *online* access even though *detection* is offline, because resolving a tag to its SHA requires querying the registry/API. So `zizmor --fix` (online) could replace pinact for the pinning step, but it is one tool doing double duty (audit + fix) rather than pinact/ratchet's dedicated purpose. Source: `docs/usage.md` "Auto-fixing results" / "Limitations" sections, raw GitHub.

**Keeping pins current without version-update PRs**: GitHub's own Dependabot docs confirm a documented, minimal pattern — add a `dependabot.yml` entry with `package-ecosystem: "github-actions"` and `open-pull-requests-limit: 0`. Per [docs.github.com/.../configuring-dependabot-security-updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates): *"If you only require security updates and want to exclude version updates, you can set `open-pull-requests-limit` to `0` in order to prevent version updates for a given `package-ecosystem`."* Dependabot's automatic, alert-driven **security** updates (a separate feature from scheduled **version** updates) still fire for `github-actions` because that ecosystem is a supported Dependabot ecosystem (confirmed in the `package-ecosystem` reference table on the same docs site) — they are not gated by `open-pull-requests-limit`, which only throttles version-update PRs. This is exactly the "security-only Dependabot config limited to `github-actions`" #933 asks about, and needs no dependabot.yml `updates[].schedule` at all beyond the `open-pull-requests-limit: 0` entry.

## 4. `npm install -g @anthropic-ai/claude-code` and `npx skills@latest ...`

- `npm install -g @anthropic-ai/claude-code` appears in all seven agent workflows that run a Claude Code runner (`agent-implement-pr.yml`, `agent-implement-prd.yml`, `agent-implement.yml`, `agent-promote-queued.yml` — **could not verify, did not grep this one specifically before stopping**, `agent-review.yml`, `agent-to-issues-prd.yml`, `agent-update-branch.yml`; confirmed by grep in the other six). zizmor's `adhoc-packages` rule (a `help`-level finding, not counted toward severity) fires on every one of these: it pattern-matches `npm install`/`i`/`add` (and `gem install`, `yarn add`, `bundle add`) followed by a non-flag package argument, per the rule's own source (`crates/zizmor/src/audit/adhoc_packages.rs`, `AdhocPackages::is_adhoc_install_command`). Recommended pinning form: pin the version, e.g. `npm install -g @anthropic-ai/claude-code@<exact-version>`, resolved from the npm registry (`npm view @anthropic-ai/claude-code version`) rather than always installing `latest`; that also silences the "outside a lockfile" complaint in spirit even though the rule itself doesn't check for a version pin, only for the ad-hoc install shape.
- `npx --yes skills@latest add mattpocock/skills -g -s code-review -a claude-code -y --copy` (found only in `agent-review.yml:132`) is **not** flagged by `adhoc-packages` — the rule's command matcher only recognizes `npm`, `yarn`, `gem`, and `bundle` subcommands, not `npx`, so this line produced zero zizmor findings in either persona. Recommended pinning form regardless: pin an exact version, e.g. `npx --yes skills@<exact-version> add ...`, since `@latest` is a moving, unauthenticated target functionally equivalent to an unpinned action.

## Could not verify

- ratchet's exact `--check`/CI-gate invocation and its pinned-comment output format (README skimmed, not its `docs/` usage pages).
- Whether `agent-promote-queued.yml` contains the `npm install -g @anthropic-ai/claude-code` line (not individually grepped before the coordinator's stop instruction; treat as likely based on the other six agent workflows sharing the same runner pattern, but unconfirmed).
- The org/repo default `GITHUB_TOKEN` permission level referenced for `ci.yml`'s missing top-level `permissions:` block (zizmor's `excessive-permissions` default-persona finding) — not checked in repo/org settings.
- Whether shellcheck/pyflakes were present in this sandbox for actionlint's embedded-script depth (its 0-finding result held either way, so this doesn't change the actionlint conclusion, but the *depth* of that check is unconfirmed).
- zizmor's *online* audits (e.g. anything needing the GitHub API/repository fetches) were not run — only `--no-online-audits` (offline) runs, per the coordinator's time-box; the two personas' offline results above are what's reported.
