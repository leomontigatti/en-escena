import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";

const testDatabaseLockKey = "en-escena-test-database";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function resetTestDatabase() {
  await db.transaction(async (tx) => {
    if (getDatabaseTestBackend() === "postgres") {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${testDatabaseLockKey}))`,
      );
    }

    const existingTablesResult = await tx.execute<{ tablename: string }>(
      sql.raw(`
        select tablename
        from pg_tables
        where schemaname = 'public'
          and tablename like 'en\\_escena\\_%' escape '\\'
        order by tablename
      `),
    );
    const tablesToTruncate = readRows(existingTablesResult).map(
      (table) => table.tablename,
    );

    if (tablesToTruncate.length === 0) {
      return;
    }

    await tx.execute(
      sql.raw(
        `truncate table ${tablesToTruncate
          .map(quoteIdentifier)
          .join(", ")} restart identity cascade`,
      ),
    );
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

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
