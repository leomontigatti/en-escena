import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";
import { runPgliteSchemaMigrate } from "./pglite-schema-runner";
import { resetDatabaseTables } from "./reset";

export async function createPgliteTestDatabase() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "en-escena-pglite-"));
  runPgliteSchemaMigrate(dataDir);
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
  await resetDatabaseTables(db);
}
