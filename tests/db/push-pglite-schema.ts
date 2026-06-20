import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

const { internalInvitationTokens: _internalInvitationTokens, ...pgliteSchema } =
  schema;

const dataDir = process.argv[2];

if (!dataDir) {
  throw new Error("PGlite schema push requires a data directory argument.");
}

const client = new PGlite(dataDir);
const db = drizzle(client, { schema: pgliteSchema });

try {
  const { apply } = await pushSchema(pgliteSchema, db as never);
  await apply();
} finally {
  await client.close();
}
