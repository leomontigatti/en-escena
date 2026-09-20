import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";

import { isPgliteTestBackend } from "./backend";
import { resetDatabaseTables } from "./reset";

export { isPgliteTestBackend };

const testDatabaseLockKey = "en-escena-test-database";

async function resetTestDatabase() {
  await db.transaction(async (tx) => {
    if (!isPgliteTestBackend()) {
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
