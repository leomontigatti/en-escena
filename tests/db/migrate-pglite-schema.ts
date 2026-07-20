import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { pgliteSchema } from "./pglite-schema";

// Aplica las migraciones versionadas (app/db/migrations) sobre una data dir de
// PGlite. Reemplaza el push directo de `pushSchema`: el harness de tests ejerce
// el mismo SQL que corre en prod, no un diff del schema. `pushSchema` sobrevive
// solo como oráculo del test de equivalencia (app/db/migrations.db.test.ts).
const migrationsFolder = fileURLToPath(
  new URL("../../app/db/migrations", import.meta.url),
);

const dataDir = process.argv[2];

if (!dataDir) {
  throw new Error("PGlite migrate requires a data directory argument.");
}

const client = new PGlite(dataDir);
const db = drizzle(client, { schema: pgliteSchema });

try {
  await migrate(db, { migrationsFolder });
} finally {
  await client.close();
}
