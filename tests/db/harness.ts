import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";

import { resetDatabaseTables } from "./reset";

const testDatabaseLockKey = "en-escena-test-database";

async function resetTestDatabase() {
  await db.transaction(async (tx) => {
    if (getDatabaseTestBackend() === "postgres") {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${testDatabaseLockKey}))`,
      );
    }

    // The reset deletes from (and rewinds the sequences of) only the objects
    // the previous test dirtied, instead of truncating all 29 tables; see the
    // rationale and the measurements at the top of `./reset.ts`.
    await resetDatabaseTables(tx, db);
  });
}

export function installDatabaseTestHooks() {
  beforeEach(async () => {
    await resetTestDatabase();
  });
}

function getDatabaseTestBackend() {
  return isPgliteTestBackend() ? "pglite" : "postgres";
}

/**
 * The fast suite (`pnpm test:db`) runs on a single in-process PGlite instance
 * with one connection, shared by the whole process; `tests/db/setup-fast.ts`
 * announces it through `DB_TEST_BACKEND`. That connection serialises every
 * transaction on its own, so a test that means to observe contention — a
 * `FOR UPDATE`, an advisory lock — observes nothing there and passes for the
 * wrong reason. Gate those with `describe.skipIf(isPgliteTestBackend())` so they
 * run only where contention is real: `pnpm test:db:postgres` and the CI
 * `db-gate` shards, which build a pooled client.
 */
export function isPgliteTestBackend() {
  return process.env.DB_TEST_BACKEND === "pglite";
}
