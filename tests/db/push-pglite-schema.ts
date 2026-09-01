import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";

// The oracle of the equivalence test (app/db/migrations.db.test.ts): it applies
// the schema with `pushSchema` onto a PGlite data dir. It runs in a tsx
// subprocess on purpose — the `drizzle-kit/api` bundle does not survive vite's
// transform, so it is never imported inside a vitest worker.
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
