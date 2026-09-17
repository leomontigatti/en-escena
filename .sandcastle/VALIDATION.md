# Validation policy for AFK agents

How an agent running inside a GitHub Actions runner should validate its work
before committing. CI is the merge gate; the agent's job is to catch its own
mistakes cheaply, not to reproduce CI.

## The rule

```sh
pnpm typecheck
pnpm lint                # ~6.5 s over the whole repo
pnpm test:unit
pnpm test:db <path>...   # only the DB test files your change touches
```

Run this **once, after your edits**. Do not run `pnpm test`.

## This list is exhaustive

These four are the whole validation surface. **Do not invent commands.** If a
command you are about to run is not on this list, it either does not exist or is
not yours to run — check `package.json` before running it, never after it fails.

A concrete failure this rule exists to prevent: on run 31192040488 an agent
finished its work green, then spent its remaining budget running the full
`pnpm test:db` twice (this policy says not to) and finally chained a `pnpm lint`
that **did not exist at the time**. The step timeout killed it mid-chain, before
it had committed, and the entire slice was lost.

The scripts that exist and what owns what:

| Command                     | Owns                                                      |
| --------------------------- | --------------------------------------------------------- |
| `pnpm typecheck`            | Types, unused locals and parameters — also run by the `Stop` hook |
| `pnpm lint`                 | React hook mistakes, import cycles and un-awaited promises — **only** these; also run by the `Stop` hook |
| `pnpm format` / `:check`    | All formatting — also applied per file by the `PostToolUse` hook |
| `pnpm test:unit`            | Unit and React suites                                      |
| `pnpm test:db <path>`       | DB suite on in-process PGlite                              |
| `pnpm check:doc-map`        | Mapped code changed in step with its doc                   |
| `pnpm check:repo-styles`    | Hardcoded colour scales, `space-x/y-*`                     |
| `pnpm check:banned-imports` | Retired dependencies stay retired                          |
| `pnpm check:file-tokens`    | Staged `app` modules under the token ceiling               |
| `pnpm check:migration-order`| New migrations postdate `master`                           |
| `pnpm check:comment-language`| Spanish prose in comments, test names, thrown error messages, docs and YAML |
| `pnpm check:fallow`         | Fallow's `new-only` gate on what the branch adds           |
| zizmor (CI only)            | Actions security posture and pin freshness — `.github/workflows/**` |
| actionlint (CI only)        | Workflow syntax and expressions — `.github/workflows/**` |
| gitleaks (pre-commit + CI)  | Secrets in commits — `.gitleaks.toml` rules over the staged diff, then over `origin/master..HEAD` |

CI runs the `check:*` scripts and `pnpm build` for you. You do not need to.

Three of those rows have an automatic enforcement point inside the session, and
they fire in this runner too (#982). `PostToolUse` on `Write|Edit` formats every
file you write, silently, so `pnpm format` is not yours to remember. `Stop` runs
`pnpm typecheck && pnpm lint` and **blocks the end of the turn** with exit 2 and
the failing output when either is red — it is a backstop, not a substitute for
running them yourself, since it reports once at the end with no idea what you
changed. It skips a turn that touched nothing either half of the gate reads —
`.ts`/`.tsx`/`.mts`/`.cts`, `tsconfig*.json` and `package.json` for typecheck,
`.js`/`.jsx`/`.mjs`/`.cjs` and `.oxlintrc.json` for lint — and it skips every
workflow outside the three implement runners, `AFK Review` included. It looks at
the working tree only; committed work was already typechecked by pre-commit.
`SKIP_STOP_CHECKS` set to any value is the bypass (`SKIP_STOP_CHECKS=1`), and it
is for local work, not for getting a red branch committed here. Both hooks are
described in `docs/agents/workflows.md`.

gitleaks has no `check:*` script either: it runs from `.husky/pre-commit`, where
it warns and continues if the binary is missing, and blocking from the `checks`
job. It is only the client-side half of the secrets gate — GitHub secret scanning
with **push protection** is the server-side owner for provider tokens, and it
blocks the push itself, so the custom rules in `.gitleaks.toml` deliberately cover
only what this repo can leak that push protection does not (#978).

The zizmor and actionlint rows are the `actions-gate` job (#955) and have no local
script on purpose: they only ever read `.github/workflows/**`, and both are pinned inside
`ci.yml`. If you edited a workflow, the gate is what tells you; how it is set up
and how to bump its pins is in `docs/agents/workflows.md`.

## About `pnpm lint`

`oxlint`, configured in `.oxlintrc.json` — that file is the list of rules, read it
there rather than trusting a count written down here. What `pnpm lint` owns is
React hook mistakes, import cycles and un-awaited promises.

The un-awaited-promise rules are type-aware (`oxlint-tsgolint`), which is why the
run costs ~6.5 s instead of the ~1.5 s it cost before: type-aware linting builds a
TypeScript program. They catch the bug class `tsc` cannot see — a promise nothing
awaits, which silently drops whatever it would have rejected with.

**The `void` policy.** `void` on a promise is a claim that its rejection cannot
carry information, and the only case this repo treats as settled is a React Router
`submit`, `fetcher.submit`, `fetcher.load` or `navigate` call: the router routes
loader and action failures to the nearest `ErrorBoundary`, so those promises reject
only on a framework invariant. `void` on **any other** promise needs a reason in the
code, and a reviewer should ask for one — `await` it, or handle the rejection.

It is **not** a style checker. It has no opinion on formatting (Prettier's), on
unused code (`tsc`'s) or on this repo's conventions (the `check:*` scripts').
If it reports nothing, that is the expected result, not a reason to look for
another linter.

Fourteen files carry a **temporary exemption** from `exhaustive-deps`, listed
under `overrides` in `.oxlintrc.json`. They use a deliberate
`resetKey = JSON.stringify(values)` idiom the rule cannot see through. Do not add
to that list to make your change pass — if your new code trips the rule, the rule
is probably right.

## Why not `pnpm test`

`pnpm test` is `test:unit && test:db` — serial, and on the 2-core runner it takes
about 13 minutes. Measured on this repo, pinned to 2 cores:

| step               | wall-clock  |
| ------------------ | ----------- |
| `pnpm test:unit`   | ~2.6 min    |
| `pnpm test:db`     | ~10 min     |
| `pnpm test` (both) | ~13 min     |

Most runner steps get 30 minutes; the implement passes get 60, with a 50-minute
budget (the table is in `docs/agents/afk-setup.md`). A prompt that asks for
`pnpm test` before *and* after the edits spends ~26 minutes waiting, which is what
exhausted a 30-minute budget on PR #512 and lost an entire review's findings.

CI never does this: `checks` runs on its own runner and the DB suite is split
across the `db-shard` matrix behind the `db-gate` aggregator (#962), so the whole
pipeline finishes in the time of its slowest job. Duplicating that serially
inside the agent buys nothing.

## Why still run the full unit suite

`test:db` is ~80% of the cost, so targeting it is where the savings are. The unit
suite is broad and cheap, and it is the thing most likely to catch a regression
in code the change did not touch. Keeping it costs ~2.6 minutes and preserves
almost all of the safety net.

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
on the pushed commit within ~5 minutes and the PR carries the red check for a
human or a later agent pass to pick up.
