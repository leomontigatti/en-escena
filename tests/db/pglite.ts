import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

const { internalInvitationTokens: _internalInvitationTokens, ...pgliteSchema } =
  schema;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const pushPgliteSchemaScriptPath = fileURLToPath(
  new URL("./push-pglite-schema.ts", import.meta.url),
);

export async function createPgliteTestDatabase() {
  const dataDir = await mkdtemp(`${tmpdir()}/en-escena-pglite-`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", pushPgliteSchemaScriptPath, dataDir],
    {
      env: process.env,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to apply the PGlite schema.");
  }

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
