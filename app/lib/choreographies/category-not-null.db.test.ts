import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// The last guard of the invariant, under every refusal the application makes:
// a choreography that names no category is not a row the database accepts.
describe("choreography category column", () => {
  test("is not nullable", async () => {
    const result = await db.execute<{ is_nullable: string }>(
      sql.raw(`
        select is_nullable
        from information_schema.columns
        where table_name = 'en_escena_choreography'
          and column_name = 'category_id'
      `),
    );

    const rows = readRows(result);

    expect(rows).toEqual([{ is_nullable: "NO" }]);
  });
});

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
