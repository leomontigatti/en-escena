/**
 * The fast suite (`pnpm test:db`) runs on a single in-process PGlite instance
 * with one connection, shared by the whole process; `tests/db/setup-fast.ts`
 * announces it through `DB_TEST_BACKEND`. That connection serialises every
 * transaction on its own, so a test that means to observe contention — a
 * `FOR UPDATE`, an advisory lock — observes nothing there and passes for the
 * wrong reason. Gate those with `describe.skipIf(isPgliteTestBackend())` so they
 * run only where contention is real: `pnpm test:db:postgres` and the CI
 * `db-gate` shards, which build a pooled client.
 *
 * This lives apart from `./harness`, which re-exports it, because `./harness`
 * imports `@/db` — under the fast config that alias instantiates PGlite at
 * import time, and a test may need the predicate without needing a database.
 */
export function isPgliteTestBackend() {
  return process.env.DB_TEST_BACKEND === "pglite";
}
