# pnpm dependency hygiene: minimumReleaseAge, audit vs osv-scanner, Dependabot security-only

Research for [#935](https://github.com/leomontigatti/en-escena/issues/935), map [#929](https://github.com/leomontigatti/en-escena/issues/929).
Automated version-update PRs are ruled out on the map; this covers detection/delay only.

Repo state checked: `package.json` pins `"packageManager": "pnpm@11.9.0+sha512..."`; `pnpm-lock.yaml`
header is `lockfileVersion: '9.0'`; `pnpm-workspace.yaml` currently has no `minimumReleaseAge`,
`audit`, or `auditConfig` keys — just `allowBuilds`. There is no `.github/dependabot.yml` and no
osv-scanner workflow. `.github/workflows/ci.yml` has no audit/security-scan step.

## 1. `minimumReleaseAge`

Source: <https://pnpm.io/settings/dependency-resolution#minimumreleaseage> (docs currently serve
the 12.x tree, but the option was added in pnpm v10.16.0 and pnpm 11.9.0, the version this repo
pins, is >= that).

- Key: `minimumReleaseAge` in `pnpm-workspace.yaml`. Unit: **minutes**, not hours or days.
- Default: **1440** (24h) since pnpm v11 (it was 0 — i.e. off — before v11). This repo is already
  on pnpm 11.9.0, so **it is already getting the 24h delay by default even though `pnpm-workspace.yaml`
  never sets the key explicitly.** Setting it explicitly is about making the value visible/tunable
  and about turning on `minimumReleaseAgeStrict`, not about switching the feature on from zero.
- `minimumReleaseAgeStrict` defaults to `true` only if you set `minimumReleaseAge` yourself; the
  built-in 1440-minute default is _non-strict_, i.e. pnpm will silently fall back to an
  older-than-desired version rather than fail resolution if nothing in range clears the age. If the
  goal is an enforced floor rather than a soft preference, `minimumReleaseAge` has to be set
  explicitly (even to the same 1440) so strict mode turns on, or `minimumReleaseAgeStrict: true` set
  alongside it.
- `minimumReleaseAgeExclude` (string[], supports package names, `@scope/*` patterns, and
  `pkg@range` pins) lets specific packages/versions skip the delay — documented use case is exactly
  "I need this security fix now." `pnpm audit --fix` (v11+) automatically adds the minimum patched
  version of an advisory to this list so a fix isn't blocked by its own release-age window.
- **Interaction with `--frozen-lockfile` in CI**: pnpm docs (`trustLockfile` setting, same page)
  state that `pnpm install` normally runs a "supply-chain verification pass that re-applies
  `minimumReleaseAge` and `trustPolicy` to every entry in the loaded lockfile," and explicitly says
  "Most projects with the default `frozenLockfile` CI workflow do not need to set [`trustLockfile`]"
  — i.e. **`minimumReleaseAge` is still checked on a frozen-lockfile CI install**; it isn't skipped
  just because the lockfile is trusted-by-commit. Setting `trustLockfile: true` is the escape hatch
  that turns this verification off (not recommended here since the lockfile isn't otherwise
  author-restricted). Docs source:
  <https://pnpm.io/settings/dependency-resolution#trustlockfile>. Practical implication for CI: a
  frozen install can fail resolution here if `minimumReleaseAgeStrict` is on and a locked version
  hasn't aged out yet — a real risk if the lockfile is refreshed and committed right after a
  dependency bump.
- **`pnpm dlx` / `npx skills@latest`**: Since pnpm v11, `pnx` and its aliases `pnpm dlx` /
  `pnpx` honor the project's `minimumReleaseAge`, `minimumReleaseAgeExclude`,
  `minimumReleaseAgeStrict`, `trustPolicy` etc. when resolving/fetching the requested package
  (<https://pnpm.io/cli/pnx#security-and-trust-policies>). **This does not cover plain `npx`** —
  `npx` is npm's own tool, a different binary with its own resolution logic; pnpm's
  `pnpm-workspace.yaml` settings have no effect on it. The agent workflows in this repo invoke
  `npx skills@latest` (`docs/agents/shadcn.md` uses `pnpm dlx skills add ...` instead, which _is_
  covered) — **could not verify** every workflow invocation is `pnpm dlx`; grep of
  `docs/agents/*.md` only turned up the `pnpm dlx skills add` form, but the ticket specifically
  names `npx skills@latest` as a workflow usage, which — if literal — sits outside any
  `minimumReleaseAge` protection this repo sets.

## 2. `pnpm audit` as a gate, vs `osv-scanner`

Source: <https://pnpm.io/cli/audit> (docs serve 12.x; flags below are v11-era unless noted).

- `pnpm audit` queries the registry's `/-/npm/v1/security/advisories/bulk` endpoint. Since v11 the
  response carries GHSA ids, not CVEs.
- Flags relevant to a CI gate:
  - `--audit-level <low|moderate|high|critical>` (default `low`) — filters which advisories are
    _printed_, mirrored by `audit.level` in `pnpm-workspace.yaml`.
  - `--prod` / `-P` — only audits `dependencies`, not `devDependencies`.
  - `--dev` / `-D` — only dev deps.
  - `--ignore-unfixable` — drop advisories with no available fix.
  - `--ignore-registry-errors` — exit 0 if the registry itself errors (vs. finding vulnerabilities),
    useful to keep a flaky registry from failing CI for the wrong reason.
  - `--json` for machine-readable output (`patched_versions: null` distinguishes "no fix" from
    "fix at version X").
- **Ignore mechanism**: the ticket names `pnpm.auditConfig.ignoreCves`, but that key **is gone as of
  pnpm v11** ("Before v11, `auditConfig.ignoreCves` was used to filter advisories by CVE identifier.
  That setting is no longer recognized," per the docs page). The current mechanism is
  `audit.ignore: [GHSA-xxxx-...]` under an `audit:` block in `pnpm-workspace.yaml`, **added in
  pnpm v11.16.0** — one minor above the 11.9.0 this repo pins. On 11.9.0 the equivalent (deprecated
  but still working "until the next major version") key is `auditConfig.ignoreGhsas` plus
  `auditLevel` (not `audit.level`). \*\*Action item for whoever configures this: check the installed
  pnpm version before writing `pnpm-workspace.yaml` — `audit.ignore` needs >=11.16.0, not just
  > =11.\*\* Could not verify the exact 11.x patch level currently resolved by `pnpm@11.9.0` allows a
  > transparent bump to >=11.16.0 without a `packageManager` field change (it would — a `+sha512`
  > pin means the field itself would need editing to move the version).
- **Exit code**: docs don't publish an explicit table for the base `pnpm audit` command (only
  `pnpm audit signatures` is documented as exiting 1 on an invalid/missing signature). Observed in
  this repo's own run (§4 below): `pnpm audit --prod` exited **1** when vulnerabilities were found,
  consistent with the conventional audit exit-code contract (0 = clean, 1 = findings) — **could not
  verify** this is documented rather than incidental behavior.
- **Known noise**: `pnpm audit` reports transitive/dev-tool advisories with no bearing on the
  shipped app (e.g., in this repo's run: `xmldom` advisories from `@aws-sdk` internals pulled in
  by S3 storage tooling, `hono`/`@modelcontextprotocol/sdk` advisories pulled in transitively by the
  `shadcn` CLI, `esbuild`/`vite` dev-server advisories). `--prod` filters out pure devDependencies
  but not prod deps' _own_ dev/build tooling that ends up in `dependencies` of a sub-package (this
  repo's run still surfaced `xmldom`, `hono`, `vitest`/`@vitest/mocker` even with `--prod`, because
  those are transitive of `@react-router/*` / `shadcn`, which are listed as regular deps here — see
  the actual dependency paths in §4).
- **osv-scanner** (<https://github.com/google/osv-scanner-action>, README at that URL; v2.6.0 is
  the badge-pinned release as of this research):
  - Ships two reusable GitHub Actions workflows: a PR-diff scan (fails only on _new_ vulnerabilities
    introduced by the PR — lower noise than a full-tree audit on every PR) and a full/scheduled
    scan that reports to the repo's Security > Code Scanning tab.
  - Lockfile support: the extraction backend (`osv-scalibr`, vendored into osv-scanner) parses
    `pnpm-lock.yaml` and explicitly branches on `lockfileVersion >= 9.0`
    (`extractor/filesystem/language/javascript/pnpmlock/pnpmlock.go`, confirmed by reading the file
    at `raw.githubusercontent.com/google/osv-scalibr/main/...`) — this repo's lockfile header
    (`lockfileVersion: '9.0'`) is inside the explicitly-handled range, not just "probably fine."
  - Pinning: the action's own README badge pins a specific release tag (`v2.6.0` at research time);
    consuming it in a workflow should pin to a tag or a commit SHA the same way any third-party
    action is pinned in this repo's other workflows (not verified against this repo's actual pin
    style — **could not verify**, would need to check an existing third-party-action pin in
    `.github/workflows/*.yml` for the house convention).
  - Versus `pnpm audit`: osv-scanner draws from the OSV.dev aggregated database (broader than just
    GHSA-sourced npm advisories) and supports PR-diff mode out of the box, which is the natural fit
    for "only fail CI on vulnerabilities the PR itself introduces" — `pnpm audit` has no equivalent
    diff mode; it always reports the whole current tree.

## 3. Dependabot: security updates only, no version-update PRs

Sources: <https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates>
and <https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file>.

- **Security updates and version updates are two independent GitHub features**, not two modes of
  the same `dependabot.yml` file:
  - _Dependabot security updates_ is a repository-level toggle (Settings > Code security >
    Dependabot alerts / Dependabot security updates). Once on, Dependabot automatically opens a PR
    for **every** open Dependabot alert that has an available patch — no `dependabot.yml` is
    required for this to function at all.
  - _Dependabot version updates_ is what `dependabot.yml` (`package-ecosystem`, `schedule`,
    `open-pull-requests-limit`, etc.) configures — non-vulnerability "keep this at latest" PRs.
- **`open-pull-requests-limit: 0` only throttles version-update PRs.** The docs say explicitly:
  "_Security update_ pull requests are not subject to this limit and do not count toward it. There
  is no limit on the number of open pull requests for security updates." So a `dependabot.yml` with
  `open-pull-requests-limit: 0` (or no `dependabot.yml` at all) already gives "no version-update
  PRs, ever" — which matches the map's constraint — but it does **not** control whether security-fix
  PRs appear; that's the separate repo-level toggle above, and if it's on, PRs are uncapped.
- **To get alerts with zero PRs of any kind**: leave _Dependabot security updates_ off (the
  Dependency graph + Dependabot alerts features alone already populate the Security tab with
  vulnerability alerts, no PRs, no `dependabot.yml` needed) and don't add a `dependabot.yml` (or add
  one solely to silence version updates, which is redundant if it's simply absent).
- **What this gives beyond `pnpm audit`/osv-scanner in CI**: continuous, GitHub-native alerting off
  the dependency graph (updates as soon as a new advisory is published, independent of when someone
  next runs CI), a persistent Security tab / alert inbox instead of a build-log line, and — if
  security updates are turned on — an actual auto-generated fix PR per vulnerable dependency
  (something neither `pnpm audit` nor osv-scanner do by themselves; osv-scanner only reports). The
  map rules out automated _version_-update PRs, not security-fix PRs, so turning on Dependabot
  security updates would not violate that constraint as written — **flagging this distinction
  explicitly since the ticket's framing ("security updates only, no version-update PRs") suggests
  it's exactly what's wanted, but it is a policy call, not a technical one, so left to whoever
  decides the gate, not decided here.**

## 4. `pnpm audit --prod` on this repo today

Run in a throwaway worktree (`/tmp/en-escena-research-pnpm-dependency-hygiene`, branch
`research/pnpm-dependency-hygiene`, `pnpm install --frozen-lockfile` then `pnpm audit --prod`), pnpm
11.9.0, 2026-09-14.

Exit code: **1**. Summary line: **`57 vulnerabilities found` — `2 low | 24 moderate | 31 high`**.

By affected package (count of distinct advisories):

| Package                                                                                                                                    | Advisories | Notes                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------- |
| `@xmldom/xmldom`                                                                                                                           | 10         | transitive via AWS SDK deps used for storage                        |
| `hono`                                                                                                                                     | 7          | transitive via `shadcn` CLI's `@modelcontextprotocol/sdk`           |
| `fast-uri`                                                                                                                                 | 6          | SSRF-related, transitive                                            |
| `brace-expansion`                                                                                                                          | 6          | ReDoS-class, transitive via `minimatch` (`@react-router/fs-routes`) |
| `undici`                                                                                                                                   | 5          | request/response smuggling-class                                    |
| `js-yaml`                                                                                                                                  | 3          |                                                                     |
| `ip-address`                                                                                                                               | 3          |                                                                     |
| `qs`                                                                                                                                       | 2          |                                                                     |
| `postcss`                                                                                                                                  | 2          |                                                                     |
| `nanoid`                                                                                                                                   | 2          |                                                                     |
| `browserslist`                                                                                                                             | 2          |                                                                     |
| `@vitest/mocker`, `vitest`, `valibot`, `react-router`, `morgan`, `@hono/node-server`, `esbuild`, `body-parser`, `baseline-browser-mapping` | 1 each     |                                                                     |

Representative highs: `react-router` — RSC Mode CSRF bypass allowing action execution
(GHSA link in the audit's "More info" column); `body-parser` <1.20.6 DoS
(GHSA-v422-hmwv-36x6), pulled in 4 separate ways through `@react-router/*` / `express`;
`brace-expansion` DoS variants via `@react-router/fs-routes > minimatch`. A representative low:
`hono` Proxy Helper header-stripping gap (GHSA-79qm-7rj5-m7r9), transitive via `shadcn`'s MCP SDK
dependency, not part of the shipped app.

Most of the `high`/`moderate` volume traces to two dev/build-tool trees — `@react-router/fs-routes`
(brings in an old `minimatch`/`brace-expansion`, and the whole `express`/`body-parser` server
stack via `@react-router/serve`) and `shadcn`'s `@modelcontextprotocol/sdk` (brings in `hono`,
`@hono/node-server`) — rather than runtime application code paths. Confirming which of these are
actually reachable at runtime vs. dev-only requires walking `pnpm why <pkg>` per package, which
this research did not do exhaustively; only the `body-parser` and `hono` paths above were checked
via the audit's own `Paths` column.

## Recommendation (for the implementing agent to weigh, not decided here)

1. Set `minimumReleaseAge: 1440` (or higher) explicitly in `pnpm-workspace.yaml` so
   `minimumReleaseAgeStrict` turns on — the current implicit default is non-strict and will
   silently ignore the floor when needed. Add a `minimumReleaseAgeExclude` only for specific
   emergency-patch cases.
2. Gate CI on `pnpm audit --prod --audit-level high` (or osv-scanner's PR-diff action) rather than
   the full `pnpm audit` — the unfiltered run is 57 findings, nearly all `moderate`/`high` noise
   from build tooling, not runtime code. If moving to `audit.ignore`, first confirm the installed
   pnpm is >=11.16.0 (this repo is pinned to 11.9.0); on 11.9.0 the working key is the deprecated
   `auditConfig.ignoreGhsas`.
3. Consider osv-scanner's PR-diff workflow instead of/alongside `pnpm audit` in CI specifically
   because it only fails on vulnerabilities a PR _introduces_, avoiding a re-triage of the existing
   57 findings on day one.
4. For Dependabot: enabling security-only updates does not need a `dependabot.yml` at all if "zero
   PRs, alerts only" is the goal (just the repo Security settings toggle); a `dependabot.yml` is
   only needed if version-update _scheduling knobs_ are wanted, and even then
   `open-pull-requests-limit: 0` fully suppresses version PRs while leaving security PRs
   (if that toggle is separately on) uncapped.

## Could not verify

- Whether the ticket's literal `npx skills@latest` (vs. `pnpm dlx skills add`, the only form found
  in `docs/agents/*.md`) is actually invoked anywhere in this repo's workflows — grep only turned up
  the `pnpm dlx` form.
- Exact pnpm audit exit-code contract as documented (only observed empirically here; pnpm's docs
  page only documents the exit code for `pnpm audit signatures`, not base `pnpm audit`).
- This repo's house convention for pinning third-party GitHub Actions (tag vs. SHA) — relevant to
  how an osv-scanner-action pin should look, but not checked against an existing workflow file here.
- Whether bumping the pinned pnpm version from 11.9.0 to >=11.16.0 (needed for `audit.ignore`) is
  otherwise safe/desired for this repo — out of scope for this research.
