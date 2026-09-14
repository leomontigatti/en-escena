# oxlint type-aware linting on TypeScript 7

Research for [#931](https://github.com/leomontigatti/en-escena/issues/931), on map
[#929](https://github.com/leomontigatti/en-escena/issues/929). Feeds the decision
ticket [#938](https://github.com/leomontigatti/en-escena/issues/938).

Repo stack checked directly: `oxlint` `^1.77.0`, `typescript` `^7.0.2`
(`package.json`), `.oxlintrc.json` (plugins `react`, `import`; `import/no-cycle`
and the two react-hooks rules are the only non-default rules turned on), and
`tsconfig.json` (`paths: { "@/*": ["./app/*"] }`, `include: ["**/*", ...]`).

## 1. Exact install and config for this repo

- Package: `oxlint-tsgolint`, an **optional peer dependency** of `oxlint` since
  at least 1.77.0 (`peerDependenciesMeta.oxlint-tsgolint.optional: true`) —
  confirmed by reading both the 1.77.0 and 1.83.0 (current latest,
  2026-09-14) version manifests from the npm registry JSON
  (`registry.npmjs.org/oxlint`). oxlint's peer range is
  `oxlint-tsgolint: >=7.0.2001`. Install:
  `pnpm add -D oxlint-tsgolint@latest` (oxc.rs install docs,
  https://oxc.rs/docs/guide/usage/linter/type-aware.html). npm registry for
  `oxlint-tsgolint` shows `latest` is `7.0.2001`, published 2026-07-21,
  `bin: { tsgolint: "./bin/tsgolint.js" }`, no runtime `dependencies` of its
  own — confirming the handoff's "7.0.200x exists on npm" claim.
- Enable with the CLI flag `oxlint --type-aware`, or the root-only config key
  `"options": { "typeAware": true }` in `.oxlintrc.json` (nested/override
  configs must not set it). `--type-aware` on the CLI wins over the config
  file. Add `"typescript"` to `plugins` and turn rules on under the
  `typescript/*` namespace, e.g. `"typescript/no-floating-promises": "error"`.
  Source: https://oxc.rs/docs/guide/usage/linter/type-aware.html
  ("Running type-aware linting", "Configuring type-aware rules").
- tsconfig resolution: type-aware linting resolves types from the project's
  own tsconfig(s); nothing repo-specific is needed for the `@/*` → `./app/*`
  alias beyond what `tsc`/`vite-tsconfig-paths` already use, since tsgolint
  builds a TypeScript-go program from the discovered tsconfig — **could not
  verify** a documented, alias-specific resolution step beyond "tsgolint
  builds TypeScript programs using typescript-go" (same source, "Overview").
  One concrete risk _is_ documented and _is_ present in this repo: the guide
  explicitly warns that a root tsconfig with `"include": ["**/*"]` "catches
  everything" and can pull in build output, causing slowdowns, recommending a
  scoped `include` and explicit `exclude` instead
  (https://oxc.rs/docs/guide/usage/linter/type-aware.html, "Root tsconfig
  includes too many files"). The repo's `tsconfig.json` has exactly this
  pattern (`"include": ["**/*", "**/.server/**/*", "**/.client/**/*",
".react-router/types/**/*"]`), though it does have `"exclude":
["node_modules", "build", ".sandcastle", ".claude/worktrees"]`, so the
  worst case (`node_modules`) is already excluded. Worth tightening `include`
  before switching this on for real, per the docs' own guidance.
- TypeScript compatibility: type-aware linting requires **TypeScript 7.0+**
  and is "powered by typescript-go"; some options deprecated in 6.0 or
  removed in 7.0 (e.g. `baseUrl`) are unsupported (same source, "TypeScript
  compatibility"). Repo is already on `typescript ^7.0.2` and its
  `tsconfig.json` uses `paths` (not `baseUrl`), so no migration is implied
  here — **could not verify** exhaustively that every other tsconfig option
  in use is TS7-safe; I only checked for `baseUrl`.

## 2. Rule support

Read `github.com/oxc-project/tsgolint`'s README (raw, `main` branch) directly,
which lists all 61 typescript-eslint type-aware rules with `[x]`/`[ ]`
implementation checkboxes:

- `typescript/no-floating-promises` — **implemented** (`[x]`, line 184).
- `typescript/no-misused-promises` — **implemented** (`[x]`, line 188).
- `typescript/no-unnecessary-condition` — **implemented** (`[x]`, line 193).
- `typescript/await-thenable` — **implemented** (`[x]`, line 175).
- `typescript/require-await` — **implemented** (`[x]`, line 225).

All four justification-test candidates from the ticket are implemented. Only
2 of 61 rules are unimplemented: `naming-convention` and
`prefer-destructuring` (both `[ ]`) — neither is relevant to this repo's
question.

The 2026-07-22 stability post
(https://oxc.rs/blog/2026-07-22-type-aware-linting-stable, found via the
oxc.rs blog index since the URL guessed in the ticket 404s — actual slug is
`2026-07-22-type-aware-linting-stable`) confirms: tsgolint v7 "tracks
TypeScript v7.0.2" and ships "59 of typescript-eslint's 61 type-aware rules",
up from 43 at the December 2025 alpha. `no-unnecessary-condition` is named
explicitly as one of the 16 rules added since alpha. This matches (and
verifies, rather than just repeats) the handoff's "59/61" figure.

Justification test — "a bug class no other owner can see" — applied per
candidate, based on what actually fired on this repo (§4):

- `no-floating-promises` / `no-misused-promises`: pass. Neither `tsc --strict`
  nor oxlint's existing non-type-aware rules catch an un-awaited promise or a
  promise-returning function passed where a sync callback is expected; both
  fired real, distinct instances here (§4).
- `no-unnecessary-condition`, `await-thenable`, `require-await`: **not run**
  in this ticket — only the two headline rules were enabled per the ticket's
  Part 4 scope. Whether they'd pass the justification test on this repo is
  **could not verify** without running them, which is out of this ticket's
  budget.

## 3. Runtime cost over the whole repo

Measured in the throwaway worktree (`pnpm install --frozen-lockfile`, then
`pnpm add -D oxlint-tsgolint`), on the same machine, immediately before and
after enabling `options.typeAware` with only the two headline rules added to
`.oxlintrc.json`:

- Plain `pnpm oxlint` (current repo config, no type-aware): **2.0 s** real
  (`time` output: `real 0m2.045s`). The ticket's "current 1.1 s" figure is
  presumably from CI hardware or a warmer cache; **could not verify** that
  exact number in this environment, but it's the same order of magnitude.
- `pnpm oxlint` with `options.typeAware: true` and only
  `typescript/no-floating-promises` + `typescript/no-misused-promises` added:
  **7.6 s** real on the first run (`real 0m7.643s`, `user 0m22.735s`, i.e.
  heavily parallelized — tsgolint spins up multiple workers), **3.97 s** real
  on a second, presumably warmer run. So roughly **2–4× the current oxlint
  wall-clock time** for two type-aware rules on this repo, well under 10 s
  either way.
- `oxlint --debug timings` (the flag documented at
  https://oxc.rs/docs/guide/usage/linter/type-aware.html, "Rule timings") did
  not print a timings table with oxlint 1.77.0 in this repo — `pnpm oxlint
--help` shows the flag as `--debug=OPTIONS` (comma-separated), and
  `--debug=timings` ran without error but produced no "Rule timings" section
  in stdout/stderr. **Could not verify** a per-rule timing breakdown for this
  repo; the docs' example table itself is presumably illustrative, not from
  this repo.
- Extrapolating to all 59 rules was **not attempted** — out of budget, and
  the ticket's Part 4 only asks for the two headline rules' counts.

## 4. Findings count on this repo (Part 4)

Setup: worktree at `/tmp/en-escena-research-oxlint-type-aware-ts7` on branch
`research/oxlint-type-aware-ts7`, `pnpm add -D oxlint-tsgolint` run there only
(never on `master`). `.oxlintrc.json` temporarily edited in the worktree to
add `"typescript"` to `plugins`, `"options": { "typeAware": true }`, and
`"typescript/no-floating-promises": "error"` /
`"typescript/no-misused-promises": "error"` under `rules`, then reverted
before finishing (not committed — `package.json`/`pnpm-lock.yaml` diffs from
the install are also left uncommitted, per the ticket).

`pnpm oxlint` (exit code 1) reported **21 findings total**, run three times
with identical output each time:

- `no-floating-promises`: **14**
- `no-misused-promises`: **7**

By area — every single finding is in UI/component code, **none** in
loaders/actions, tests, or scripts:

- `app/features/**` (feature views, hooks, dialogs): 17 of 21
  - `app/features/admin/choreographies/detail/` — 8 (`use-modality-form.ts`×2,
    `use-roster-form.ts`, `use-schedule-capacity-form.ts`,
    `reassignment-fields.tsx`×2, `view.tsx`×3, one of which is
    `no-misused-promises`)
  - `app/features/portal/choreographies/` — 3 (`create/use-create-choreography-dialog.ts`×2,
    `list/view.tsx`×1)
  - `app/features/portal/dancers/` and `app/features/portal/professors/` —
    4 (`list/view.tsx`×2 misused-promises, `detail/view.tsx`×2 misused-promises)
  - `app/features/admin/finances/.../comprobante-emission.tsx` — 1
    (misused-promises)
  - `app/features/admin/comprobantes/detail/view.tsx` — 1 (misused-promises)
- `app/lib/shared/forms.ts` (shared form-submission helper): 2
  (floating-promises)
- `app/routes/ingresar.tsx` (login route component): 1 (floating-promises)
- Loaders/actions: 0. Tests: 0. Scripts: 0.

Do they look like real bugs? Spot-checked a sample:

- `app/lib/shared/forms.ts:151` and `:178` — inside a `SubmitEventHandler`
  returned by a form helper, calling `submit(...)` (React Router's
  `SubmitFunction`, which returns `Promise<void>`) without awaiting or
  attaching a rejection handler. This is the shape `no-floating-promises`
  targets directly: a dropped promise whose rejection (e.g. network failure
  during form submission) would surface as an unhandled rejection with no
  UI feedback. Plausible real bug, not a false positive.
- `app/routes/ingresar.tsx:312` — an un-awaited `navigate(...)` call (React
  Router's `useNavigate`, also promise-returning in data mode) inside what
  looks like a URL cleanup effect. Lower-severity: `navigate` rejecting is
  rare in practice, but the pattern is the same "silently dropped async
  failure" the rule's own README calls out
  (`github.com/oxc-project/tsgolint` README, "High impact" bullet).
- `app/features/admin/finances/.../comprobante-emission.tsx:104` and the
  `dancers/professors` `list/view.tsx` and `detail/view.tsx` hits — all
  `no-misused-promises` firings on React event-handler props (`onClick`,
  `onAcknowledge`, `onRecheck`, a `useEffect`-adjacent property) that receive
  an async arrow function where a `void`-returning callback is expected.
  This is a well-known noisy pattern for `no-misused-promises` in React
  codebases (fire-and-forget handlers are idiomatic there), so some of these
  7 are more likely intentional fire-and-forget than bugs — **could not
  verify** intent without reading each call site's error-handling
  discipline in full, which is beyond this ticket's scope. They're real
  findings, not tool false-positives, but the decision ticket should weigh
  how many of the 7 are "wrap in `void`" busywork versus actual missing
  `.catch`/error-boundary coverage.

## Sources

- https://oxc.rs/docs/guide/usage/linter/type-aware.html — install, CLI/config
  flags, tsconfig-includes performance warning, TS7 compatibility, timings
  flag, disable comments.
- https://oxc.rs/blog/2026-07-22-type-aware-linting-stable — stability
  announcement, 59/61 rule count, versioning scheme, cross-repo benchmark
  numbers (not re-verified against this repo).
- https://oxc.rs/blog (index) — used to find the correct blog post slug; the
  ticket's guessed URL (`.../2026-07-22-oxlint-type-aware-stable`) 404s.
- `https://registry.npmjs.org/oxlint` — peer dependency on `oxlint-tsgolint`
  (optional), version 1.77.0 and 1.83.0 manifests.
- `https://registry.npmjs.org/oxlint-tsgolint` — latest `7.0.2001`
  (2026-07-21), `bin`, no runtime deps.
- `https://raw.githubusercontent.com/oxc-project/tsgolint/main/README.md` —
  full implemented-rules checklist, quick-start config example.
- Repo: `.oxlintrc.json`, `tsconfig.json`, `package.json` (read directly).
- `pnpm oxlint` output in the throwaway worktree (this ticket's own Part 4
  run).
