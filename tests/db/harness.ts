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

    await resetDatabaseTables(tx, db);
  });
}

export function installDatabaseTestHooks() {
  beforeEach(async () => {
    await resetTestDatabase();
  });
}

function getDatabaseTestBackend() {
  return process.env.DB_TEST_BACKEND === "pglite" ? "pglite" : "postgres";
}
