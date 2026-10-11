# Validation

How a session validates its work before committing — the `implement` skill's
step 3, and what a babysitting session runs before each push. CI is the merge
gate; a session's job is to catch its own mistakes cheaply, not to reproduce CI.

## The rule

```sh
pnpm typecheck
pnpm lint                # ~6.5 s over the whole repo
pnpm test:unit
pnpm test:db <path>...   # only the DB test files your change touches
```

Run this **once, after your edits**. Do not run `pnpm test`. When a command fails,
fix it and rerun that command before the next one.

Run `pnpm typecheck` and `pnpm build` one after the other, never in parallel:
`pnpm build` cleans and regenerates `build/`, which TypeScript may read mid-check,
and the result is a transient TS6053 missing-file error that is not a real failure.

## This list is exhaustive

These four are the whole validation surface. **Every command you run is one that
exists**: check [the script index](../operations/scripts.md) before running one
that is not on this list, never after it fails. A guessed command once cost an
agent its whole budget and its uncommitted slice.

The scripts that exist and what owns what:

| Command                             | Owns                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                    | Types, unused locals and parameters, unused labels, unreachable code, implicit returns, switch fallthrough, missing `override`, unresolved side-effect imports (not asset globs such as `*.css`, which `vite/client` declares) — flags in `tsconfig.json` — also run by the `Stop` hook |
| `pnpm lint`                         | React hook mistakes, import cycles, un-awaited promises, the `ui` style guide rules and the `Trash` import — **only** these; also run by the `Stop` hook                                                                                                                                |
| `pnpm format` / `:check`            | All formatting — also applied per file by the `PostToolUse` hook                                                                                                                                                                                                                        |
| `pnpm test:unit`                    | Unit and React suites                                                                                                                                                                                                                                                                   |
| `pnpm test:db <path>`               | DB suite on in-process PGlite                                                                                                                                                                                                                                                           |
| `pnpm check:doc-map`                | Mapped code changed in step with its doc                                                                                                                                                                                                                                                |
| `pnpm check:repo-styles`            | The repo-convention rules in `scripts/repo-style-guardrail.ts`: theme colours, `gap` over `space-*`, and concepts that have one owning module                                                                                                                                           |
| `pnpm check:banned-imports`         | Retired dependencies stay retired                                                                                                                                                                                                                                                       |
| `pnpm check:labels`                 | Every label a workflow, runner or local skill names is in `.github/labels.json`                                                                                                                                                                                                         |
| `pnpm check:file-tokens`            | Staged `app` modules under the token ceiling                                                                                                                                                                                                                                            |
| `pnpm check:migration-order`        | New migrations postdate `master`                                                                                                                                                                                                                                                        |
| `pnpm check:migration-immutability` | Migrations already on `master` are never edited                                                                                                                                                                                                                                         |
| `pnpm check:migration-safety`       | squawk over migrations the branch adds: drops and renames block, lock hazards warn                                                                                                                                                                                                      |
| `pnpm check:dependency-audit`       | High and critical advisories the branch introduces, against `master`                                                                                                                                                                                                                    |
| `pnpm check:comment-language`       | Spanish prose in comments, test names, thrown error messages, shell stderr, docs and YAML                                                                                                                                                                                               |
| `pnpm check:pr-title "<title>"`     | A PR title is a conventional commit with an English subject — CI only, from `pr-title.yml`, a required context on `master`                                                                                                                                                              |
| `pnpm check:fallow`                 | Fallow's `new-only` gate on what the branch adds                                                                                                                                                                                                                                        |
| zizmor (CI only)                    | Actions security posture and pin freshness — `.github/workflows/**`                                                                                                                                                                                                                     |
| actionlint (CI only)                | Workflow syntax and expressions — `.github/workflows/**`                                                                                                                                                                                                                                |
| gitleaks (pre-commit + CI)          | Secrets in commits — `.gitleaks.toml` rules over the staged diff, then over `origin/master..HEAD`                                                                                                                                                                                       |

CI runs the `check:*` scripts and `pnpm build` for you. You do not need to.

Why the table has this shape — one owner per concern, gates scoped to what a
PR adds — is `docs/adr/0015-deterministic-guardrails.md`.

Three of those rows also run inside the session, from the hooks in
[agent-configuration.md](./agent-configuration.md#session-hooks): every file you
write is formatted, and the end of a turn is blocked while `pnpm typecheck` or
`pnpm lint` is red. The `Stop` hook is a backstop, not a substitute for running
them yourself. `SKIP_STOP_CHECKS=1` turns it off for local work, never to get a
red branch committed.

gitleaks has no `check:*` script: it runs from `.husky/pre-commit`, where it warns
and continues if the binary is missing, and blocking from the `checks` job. It is
the client-side half of the secrets gate; GitHub push protection blocks provider
tokens at the push, so `.gitleaks.toml` covers only what this repo can leak that
push protection does not.

zizmor and actionlint are the `actions-gate` job and have no local script: they
only read `.github/workflows/**`. If you edited a workflow, the gate is what tells
you; [ci.md](../operations/ci.md#the-actions-gate) has its setup and pin bumps.

## About `pnpm lint`

[oxlint](https://oxc.rs), configured in `.oxlintrc.json`: that file and the rule
messages are the source of truth, so read the rules there. It owns what nothing
else can see: React hook mistakes, import cycles, un-awaited promises, the `ui`
style guide rules listed in the header of `scripts/oxlint-ui-plugin.mjs`, and
`Trash2` over `Trash` through `no-restricted-imports`. Formatting is Prettier's,
unused code is `tsc`'s and repo conventions are the `check:*` scripts', and a rule
that duplicates another owner stays out (decision 2 of ADR-0015). If it reports
nothing, that is the expected result, not a reason to look for another linter.

The un-awaited-promise rules are type-aware (`oxlint-tsgolint`), which is most of
the ~6.5 s. Two of their options are load-bearing and invisible in the rule name:
`no-floating-promises` runs with `checkThenables: true` because Drizzle's query
builders are thenables, not `Promise`s; `no-misused-promises` runs with
`checksVoidReturn.attributes: false` so an async function in a JSX prop
(`onClick={async () => …}`) passes.

**The `void` policy.** `void` on a promise is a claim that its rejection cannot
carry information, and this repo treats exactly two cases as settled:

- A React Router `submit`, `fetcher.submit`, `fetcher.load` or `navigate` call:
  the router routes loader and action failures to the nearest `ErrorBoundary`, so
  those promises reject only on a framework invariant.
- A react-hook-form `handleSubmit(onValid)(event)` call — including a hook's
  `save()` wrapper around one. It rethrows whatever `onValid` threw, and in this
  repo every `onValid` only builds a `FormData` and submits it — the judge's score
  forms first wait for the `Devolución` take, which only resolves — so a
  rejection there is a programming error, not a runtime outcome to handle.

`void` on **any other** promise needs a reason in the code, and a reviewer should
ask for one — `await` it, or handle the rejection.

The `ui` rules have no per-file exemptions: their `overrides` entry excludes
`app/components/ui/**` and test files, and nothing else. A case they misjudge is
narrowed in the plugin, with a test. JS plugins are alpha in oxlint, so
`package.json` pins oxlint to an exact version and a plugin API change arrives as
a deliberate upgrade.

The files exempt from `exhaustive-deps` under `overrides` are a **shrinking
allowlist**: they use a deliberate `resetKey = JSON.stringify(values)` idiom the
rule cannot see through. A change passes the rule, never by joining the list: if your
new code trips the rule, the rule is probably right.

ESLint cannot replace it while `typescript-eslint` refuses TypeScript 7
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).

## Why not `pnpm test`

`pnpm test` is `test:unit && test:db` — serial. Measured on this repo, pinned to
2 cores:

| step               | wall-clock |
| ------------------ | ---------- |
| `pnpm test:unit`   | ~2.6 min   |
| `pnpm test:db`     | ~10 min    |
| `pnpm test` (both) | ~13 min    |

A local machine is faster, but the proportion holds: the DB suite is most of the
cost.

CI never does this: `checks` runs on its own runner and the DB suite is split
across the `db-shard` matrix behind the `db-gate` aggregator, so the whole
pipeline finishes in the time of its slowest job. Duplicating that serially
inside the session buys nothing.

## Why still run the full unit suite

`test:db` is ~80% of the cost, so targeting it is where the savings are. The unit
suite is broad and cheap, and it is the thing most likely to catch a regression
in code the change did not touch. Keeping it costs ~2.6 minutes and preserves
almost all of the safety net.

## A test that fails and then passes

A test that fails and passes on a rerun with nothing changed is a **flake**, and
a flake is a defect in the test: rerunning until green hides it from the next
session. Open an issue with the test's file and name and the failing output, or
add them to the open one, before moving on. Two causes found so far: state a
`unit-shared` worker carries from one file to the next (below), and a fixed pause
standing in for an outcome, where `waitFor` from
`app/lib/test-support/react-dom.tsx` waits for the outcome itself. A "Test timed
out" is the exception: it says only that the test exceeded its deadline, and
`vitest.config.ts` already allows for load. File it and investigate the timeout.

`test:unit` runs as two Vitest projects. A file that calls `vi.mock`,
`vi.doMock`, `vi.hoisted`, `vi.stubGlobal` or `vi.stubEnv`, or imports a local
helper that does, runs in `unit-isolated` with a fresh module graph; every other
file runs in `unit-shared` with `isolate: false`, sharing a worker and its
imported modules with the files before it. The split is computed from file
contents, so there is no list to keep, but a `unit-shared` test resets any
module-level state it touches (a module's `let`, a `Set`, a cache) itself. The
jsdom window is shared the same way, its URL included: a test whose form posts
to the document's URL sets it (`window.history.replaceState`) before it renders.

## Targeting DB tests

Both scripts pass positional arguments through to vitest, so a path filter works:

```sh
pnpm test:db app/lib/admin/users/users-route.server.db.test.ts
pnpm test:db app/features/portal          # directory prefix also works
```

If your change touches shared test infrastructure (`tests/db/`,
`*.test-support.ts`, a schema or migration), the blast radius is not local — run
the full `pnpm test:db` in that case.

## If CI goes red after you push

That is the expected division of labour, not a failure of this policy. CI reports
on the pushed commit within minutes, and the session babysitting the PR (the
`babysit-pr` skill) triages the red check from its log.
