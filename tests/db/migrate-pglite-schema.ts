import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { pgliteSchema } from "./pglite-schema";

// Applies the versioned migrations (app/db/migrations) onto a PGlite data dir. It
// replaces `pushSchema`'s direct push: the test harness exercises the same SQL
// that runs in production, not a schema diff. `pushSchema` survives only as the
// oracle of the equivalence test (app/db/migrations.db.test.ts).
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
