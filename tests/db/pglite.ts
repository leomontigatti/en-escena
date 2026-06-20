import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";
import { runPgliteSchemaPush } from "./pglite-schema-runner";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function createPgliteTestDatabase() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "en-escena-pglite-"));
  runPgliteSchemaPush(dataDir);
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema: pgliteSchema });

  return { client, dataDir, db };
}

export async function destroyPgliteTestDatabase(
  testDatabase: Awaited<ReturnType<typeof createPgliteTestDatabase>>,
) {
  await testDatabase.client.close();
  await rm(testDatabase.dataDir, { force: true, recursive: true });
}

export async function resetPgliteTestDatabase(
  db: Awaited<ReturnType<typeof createPgliteTestDatabase>>["db"],
) {
  const existingTables = await db.execute<{ tablename: string }>(
    sql.raw(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename like 'en\\_escena\\_%' escape '\\'
      order by tablename
    `),
  );
  const tablesToTruncate = existingTables.rows.map((table) => table.tablename);

  if (tablesToTruncate.length === 0) {
    return;
  }

  await db.execute(
    sql.raw(
      `truncate table ${tablesToTruncate
        .map(quoteIdentifier)
        .join(", ")} restart identity cascade`,
    ),
  );
}
