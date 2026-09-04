# Validation policy for AFK agents

How an agent running inside a GitHub Actions runner should validate its work
before committing. CI is the merge gate; the agent's job is to catch its own
mistakes cheaply, not to reproduce CI.

## The rule

```sh
pnpm typecheck
pnpm lint                # ~1 s over the whole repo
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
| `pnpm typecheck`            | Types, unused locals and parameters                        |
| `pnpm lint`                 | React hook mistakes and import cycles — **only** these     |
| `pnpm format` / `:check`    | All formatting                                             |
| `pnpm test:unit`            | Unit and React suites                                      |
| `pnpm test:db <path>`       | DB suite on in-process PGlite                              |
| `pnpm check:doc-map`        | Mapped code changed in step with its doc                   |
| `pnpm check:repo-styles`    | Hardcoded colour scales, `space-x/y-*`                     |
| `pnpm check:banned-imports` | Retired dependencies stay retired                          |
| `pnpm check:file-tokens`    | Staged `app` modules under the token ceiling               |
| `pnpm check:migration-order`| New migrations postdate `master`                           |
| `pnpm check:comment-language`| Spanish prose in comments, test names, thrown error messages, docs and YAML |
| `pnpm check:fallow`         | Fallow's `new-only` gate on what the branch adds           |

CI runs the `check:*` scripts and `pnpm build` for you. You do not need to.

## About `pnpm lint`

`oxlint`, configured in `.oxlintrc.json`, with exactly three rules:
`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` and
`import/no-cycle`.

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

The runner's step budget is 30 minutes. A prompt that asks for `pnpm test` before
*and* after the edits spends ~26 of those 30 minutes waiting, which is what
exhausted the budget on PR #512 and lost an entire review's findings.

CI never does this: `checks` and `db-gate` run on two parallel runners and finish
in ~4-5 minutes. Duplicating that serially inside the agent buys nothing.

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
