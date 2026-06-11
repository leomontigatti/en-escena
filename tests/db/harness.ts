import { beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";

const testDatabaseLockKey = "en-escena-test-database";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function resetTestDatabase() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${testDatabaseLockKey}))`,
    );

    const existingTables = await tx.execute<{ tablename: string }>(
      sql.raw(`
        select tablename
        from pg_tables
        where schemaname = 'public'
          and tablename like 'en\\_escena\\_%' escape '\\'
        order by tablename
      `),
    );
    const tablesToTruncate = existingTables.map((table) => table.tablename);

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
