import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";

// Row-level security was a Supabase leftover: on, with no policy, against an
// app that connects as the table owner, so it protected nothing and hid every
// row from any other role (#1654). A table that needs it again comes with its
// policies, and this test changes with them.
describe("database schema security", () => {
  test("leaves row-level security off on every public table", async () => {
    const result = await db.execute<{ table_name: string }>(
      sql.raw(`
        select c.relname as table_name
        from pg_class c
        where c.relnamespace = 'public'::regnamespace
          and c.relrowsecurity
        order by c.relname
      `),
    );

    expect(readRows(result)).toEqual([]);
  });
});

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
