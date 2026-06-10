import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { client, db } from "@/db";

const tableNames = [
  "en_escena_account",
  "en_escena_academy",
  "en_escena_academy_registration_token",
  "en_escena_event",
  "en_escena_session",
  "en_escena_user",
  "en_escena_verification",
];

export async function resetTestDatabase() {
  await db.execute(
    sql.raw(
      `truncate table ${tableNames
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
