import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { client, db } from "@/db";

export async function resetTestDatabase() {
  const existingTables = await db.execute<{ tablename: string }>(
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

  await db.execute(
    sql.raw(
      `truncate table ${tablesToTruncate
        .map((tableName) => `"${tableName}"`)
        .join(", ")} restart identity cascade`,
    ),
  );
}

export function installDatabaseTestHooks() {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await client.end();
  });
}
