# gitleaks for this repo: pre-commit, CI, allowlist, and what husky does inside the AFK runners

> Research against primary sources (gitleaks CLI `--help` and README on a locally run v8.30.1
> release binary, `gitleaks/gitleaks-action` README, husky's published `bin.js`/`index.js`
> (npm `husky@9.1.7`, matching this repo's pinned version), GitHub's own docs on secret scanning
> and push protection, and this repo's `.husky/`, `package.json`, `.sandcastle/`, `.github/workflows/`)
> for issue #934 (map #929).

## 1. The `gitleaks git --pre-commit --staged` invocation

Confirmed against `gitleaks git --help` on v8.30.1 (latest release as of 2026-09-14): `--pre-commit`
and `--staged` are current, non-deprecated flags on the `git` subcommand (not `detect`/`protect`,
which the README marks deprecated since v8.19.0, hidden from `--help` but still present as aliases).
So `gitleaks git --pre-commit --staged` is the right invocation for `.husky/pre-commit`, run from the
repo root with no positional path (defaults to cwd).
Source: `gitleaks git --help` output, and
https://github.com/gitleaks/gitleaks/blob/master/README.md (Commands section, deprecation warning).

**Cost on this repo**, measured in the throwaway worktree with the v8.30.1 Linux x64 release binary:
- `gitleaks git --pre-commit --staged .` with nothing/trivial content staged: **~0.9 s wall**, almost
  entirely process startup (0 commits scanned, <1 KB scanned) — negligible added latency in a
  pre-commit hook that already runs `lint-staged`, `check:comment-language`, `typecheck`,
  `check:file-tokens`, `check:fallow`.
- Full history scan (`gitleaks git -v .`, no `--staged`): 908 commits, ~529 MB scanned, 24.6 s. This
  is not what runs on every commit — it is the one-off/CI-scheduled full scan (§2) — but it bounds
  how slow a `--log-opts` range scan could get if ever added to pre-commit by mistake.
- Working tree only (`gitleaks dir .`): 0.9 s, 8 MB, no leaks.

**Installation.** No `gitleaks` binary is present on this machine or referenced anywhere in the repo
today (`grep -rn gitleaks package.json pnpm-lock.yaml .github` — no hits). Gitleaks is Go tooling
distributed as: Homebrew, Docker (`zricethezav/gitleaks` / `ghcr.io/gitleaks/gitleaks`), release
binaries per OS/arch on the GitHub Releases page, or built from source — there is **no npm package**
to add as a devDependency and no `npx gitleaks`. Source:
https://github.com/gitleaks/gitleaks/blob/master/README.md (Getting Started/Installing).
For a developer machine, that means either a system-level install (Homebrew on macOS, a downloaded
release binary elsewhere) or Docker; for the pre-commit hook to "fail vs skip" when the binary is
absent, that is **a decision the hook script has to make explicitly** — gitleaks itself has no
notion of "run only if present". The project's own pre-commit doc example (README "Pre-Commit"
section) assumes the `pre-commit` framework, which is a *different* tool (Python, from
pre-commit.com) than husky; this repo uses husky, so that framework's auto-skip behavior does not
apply here and would need to be replicated by hand in `.husky/pre-commit` (e.g.
`command -v gitleaks >/dev/null || { echo "gitleaks not installed, skipping"; exit 0; }`) — **could
not verify** any first-party gitleaks guidance on fail-vs-skip for a bare-binary husky hook; this is
a decision for whoever writes the hook, not a documented gitleaks behavior.

**CI (`gitleaks-action`).** The official `gitleaks/gitleaks-action` README shows the standard usage
as `uses: gitleaks/gitleaks-action@v3` (a floating major-version tag, not a pinned SHA in the
example) with `actions/checkout@v6` and `fetch-depth: 0`. v3 (current, migrated Node 20→24) requires
GitHub Actions runner ≥2.327.1 — met by all current GitHub-hosted runners. No `GITLEAKS_LICENSE` is
required for **personal-account** repos (only for organization-owned repos); `en-escena` is owned by
the user `leomontigatti` (`owner.type: "User"`, confirmed via `gh api repos/leomontigatti/en-escena`),
so no license secret is needed. `GITLEAKS_VERSION` env var can pin the gitleaks binary version the
action downloads; the action reference itself (`@v3`) is what this repo's pin-by-SHA convention
would apply to, same as any other third-party action. Source:
https://github.com/gitleaks/gitleaks-action/blob/master/README.md.

## 2. Local history + working-tree scan (throwaway worktree, v8.30.1)

Ran from `/tmp/en-escena-research-gitleaks-and-runner-hooks` (worktree of `master` at `f38f320c`):

- `gitleaks git -v --report-path <tmp>.json .` — **908 commits scanned, 1 finding, 0 real secrets.**
  The one finding is a **false positive**: the `generic-api-key` rule matched a filename string
  (an audio asset key) assigned to a `musicStorageKey` field in
  `app/features/admin/choreographies/detail/prototype-277-form.tsx` at commit `ce1e706c`, flagged
  purely on Shannon entropy of the filename. That file no longer exists in the current tree (renamed
  or removed since), but the finding persists on every full-history scan because gitleaks scans
  `git log -p`, not just HEAD.
- `gitleaks dir -v .` (working tree only) — **no leaks.**
- ARCA certs/keys: not present as files anywhere in the tree (`find . -iname "*.pem" -o -iname
  "*.crt" -o -iname "*.key" -o -iname "*.p12"` — no hits, `node_modules` excluded). They are
  supplied at runtime via base64 env vars (`ARCA_CERT_HOMO_B64`, `ARCA_KEY_HOMO_B64`, see
  `scripts/arca-spike-homo.ts`) and never committed; `.gitignore` already excludes the local cache
  directories they produce (`.arca-ta/`, `scripts/.arca-spike-output/`).
- B2/Resend credentials: only referenced by **env var name**
  (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_S3_ENDPOINT`, `B2_FILESTORE_BUCKET`, etc.) in
  `scripts/backup-storage-to-b2.sh`, `scripts/restore-drill-*-b2.sh` — no literal keys in the repo.
- Fixture/test files that could plausibly look like secrets:
  `app/lib/comprobantes/arca/fixtures.ts` (CAE numbers, CUIT `30717611590` — a real but *public* tax
  ID, not a secret, and the CAEs are synthetic values from spike #428/research #321, not real ARCA
  responses), `app/lib/events/bases-test-fixtures.server.db.ts`,
  `app/lib/choreographies/registration-test-fixtures.server.db.ts`,
  `tests/request-performance/critical-request-baseline-fixture.ts`. None of these tripped gitleaks
  in the scan above; they are noted here as the categories worth watching if a future default-rule
  update in gitleaks starts flagging them.

**Allowlist shape** to keep the CI/full-history scan quiet without hiding real leaks, per gitleaks'
own config schema (`config/config.go`: `Allowlist` struct has `Paths`, `Regexes`, and `Commits`
fields; confirmed against the shipped default config at
https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml, which extends via
`[extend] useDefault = true` plus `[[allowlist]]`/`[[allowlists]]` blocks):

```toml
# .gitleaks.toml — sketch, not committed by this research task
[extend]
useDefault = true

[[allowlists]]
description = "Known false positives: filenames matched by entropy-based rules"
commits = ["ce1e706c00a5eae02a575ed0a5ad0c93f97dbd48"]
```

Prefer `commits` (fingerprint-equivalent, scoped to the exact historical commit) over a blanket
`paths` regex, because the flagged file no longer exists — a path allowlist would silently cover any
*future* file at that same path too. If more findings turn up as gitleaks' rule set evolves, extend
the allowlist per-commit the same way, not by disabling the whole `generic-api-key` rule (that would
hide real leaks of the same shape). No `.gitleaks.toml` was committed by this research task, per the
ticket's "do not commit any config" instruction.

## 3. GitHub secret scanning and push protection

**The repo is public, not private** — `gh api repos/leomontigatti/en-escena --jq
'{private,visibility}'` returns `{"private": false, "visibility": "public"}`, contradicting the
issue title's "private repo" framing. This matters because plan gating differs by visibility.
Per GitHub's own docs (scraped 2026-09-14,
https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning, "How can I
access this feature?"): **secret scanning runs automatically for free on public repositories**;
organization-owned private/internal repos need GitHub Secret Protection (paid, Team/Enterprise
Cloud) — not applicable here since `owner.type` is `User`, and personal private repos are not
listed as covered at all outside Enterprise Managed Users/Server. Live repo settings confirm both
are already on: `gh api repos/leomontigatti/en-escena --jq .security_and_analysis` shows
`secret_scanning: enabled` and `secret_scanning_push_protection: enabled` (non-provider/generic
patterns and validity checks are `disabled`).

Push protection (https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
blocks pushes from the CLI, GitHub UI commits, file uploads, the REST API, and the GitHub MCP server
(public repos only) when it detects a secret matching a **known provider/partner pattern**, before
the push lands — this is what "GitHub's built-in" catches that a local gitleaks hook does not: it is
server-side and cannot be bypassed by skipping a local hook (a developer without the gitleaks binary,
or a CI runner with `HUSKY=0`, still gets stopped at `git push`).

What gitleaks covers that GitHub's default push protection doesn't: **project-specific secret
shapes** (ARCA cert/key material, B2/Resend keys) aren't in GitHub's partner-pattern list, so they
rely on gitleaks' generic entropy/keyword rules (or a custom rule added to `.gitleaks.toml`) — GitHub
does offer "generic patterns" and "custom patterns" as opt-in add-ons
(`secret_scanning_non_provider_patterns`, currently `disabled` on this repo) but those require
explicit configuration and are less flexible than a project-owned `.gitleaks.toml` allowlist/rule
set that runs identically in a local pre-commit hook and in CI.

## 4. Fact for several tickets: do agent commits in the runners pass through `.husky/pre-commit`?

**Yes — nothing in the runners disables husky, so the hook is live for whatever `git commit` the
Claude Code agent runs.** Evidence, in order:

- `package.json`'s `prepare` script is `"husky || true"` (bare `husky` invocation, no `husky init`
  scaffolding call).
- Reading husky 9.1.7's actual published source (`bin.js` calls `index.js`'s default export with no
  argument other than the default `d = '.husky'`): the *only* early return that skips setup is
  `if (process.env.HUSKY === '0') return 'HUSKY=0 skip install'`; otherwise, as long as `.git` exists,
  it runs `git config core.hooksPath .husky/_` unconditionally and copies the hook shims into
  `.husky/_`. Source: `husky@9.1.7` tarball from the npm registry
  (`https://registry.npmjs.org/husky/-/husky-9.1.7.tgz`), files `bin.js` and `index.js`.
- Every AFK runner workflow (`agent-implement.yml`, `agent-implement-prd.yml`, `agent-implement-pr.yml`,
  `agent-review.yml`, `agent-update-branch.yml`) does `actions/checkout@v5` (so `.git` exists) *then*
  `pnpm install --frozen-lockfile` (so `prepare`/`husky` runs) — checked by line number in each
  workflow file. None of them set `HUSKY=0` anywhere (`grep -rn "HUSKY" .github/workflows/*.yml` —
  no hits) or pass `--no-verify`/`SKIP=` to any git command (`grep -rn "no-verify\|SKIP=" .sandcastle
  .github/workflows/*.yml` — no hits either).
- `.sandcastle/` never shells out to `git commit` itself — the runner scripts (`implement.mts`,
  `implement-prd.mts`, `runner.mts`) only document that "the agent... commits" (see comments at the
  top of `.sandcastle/agent-implement/implement.mts`: "Does TDD work and commits to the current
  branch") and the orchestrator later asserts `git rev-list --count master..HEAD > 0` — the commit
  itself is issued by the spawned Claude Code agent's own bash tool calls, using whatever plain
  `git commit` it chooses, with no `--no-verify` scripted anywhere for it to inherit.
- Net effect: `core.hooksPath` is set to `.husky/_` in the runner checkout by the time the agent
  starts committing, so **`.husky/pre-commit`'s existing checks (`lint-staged`, `check:comment-language`,
  `typecheck`, `check:file-tokens`, `check:fallow`) already run on every runner commit today**, and a
  `gitleaks git --pre-commit --staged` line added to that file would run there too, with the same
  ~0.9 s cost measured in §1 — contingent on the runner's job having gitleaks installed (§1's
  install/skip question applies equally to the runner image, which does not ship it by default).

## What could not be verified

- Whether pre-commit.com-style auto-skip-on-missing-binary semantics have any first-party gitleaks
  equivalent for a bare husky hook (no pre-commit framework) — gitleaks' own docs only document the
  framework-based install, not a bare-binary fail/skip convention.
- Whether a future gitleaks default-rule update would start flagging the fixture files listed in §2
  that are currently clean.
