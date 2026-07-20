import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";

// Oráculo del test de equivalencia (app/db/migrations.db.test.ts): aplica el
// schema con `pushSchema` sobre una data dir de PGlite. Corre en un subproceso
// tsx a propósito — el bundle de `drizzle-kit/api` no sobrevive el transform de
// vite, así que nunca se importa dentro de un worker de vitest.
const dataDir = process.argv[2];

if (!dataDir) {
  throw new Error("PGlite push requires a data directory argument.");
}

const client = new PGlite(dataDir);
const db = drizzle(client, { schema: pgliteSchema });

try {
  const { apply } = await pushSchema(pgliteSchema, db as never);
  await apply();
} finally {
  await client.close();
}
