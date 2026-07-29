# Validation policy for AFK agents

How an agent running inside a GitHub Actions runner should validate its work
before committing. CI is the merge gate; the agent's job is to catch its own
mistakes cheaply, not to reproduce CI.

## The rule

```sh
pnpm typecheck
pnpm test:unit
pnpm test:db <path>...   # only the DB test files your change touches
```

Run this **once, after your edits**. Do not run `pnpm test`.

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
