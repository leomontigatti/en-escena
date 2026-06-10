import { afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";

import { client, db } from "@/db";

const tableNames = [
  "en_escena_account",
  "en_escena_academy",
  "en_escena_academy_registration_token",
  "en_escena_dancer",
  "en_escena_event",
  "en_escena_internal_user_invitation",
  "en_escena_schedule_block",
  "en_escena_schedule_block_modality",
  "en_escena_session",
  "en_escena_user",
  "en_escena_verification",
];

export async function resetTestDatabase() {
  const existingTables = await db.execute<{ tablename: string }>(
    sql.raw(`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename in (${tableNames
          .map((tableName) => `'${tableName.replaceAll("'", "''")}'`)
          .join(", ")})
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
