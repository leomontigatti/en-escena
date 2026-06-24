import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";

describe("database schema security", () => {
  test("enables row-level security on every En Escena public table", async () => {
    const result = await db.execute<{
      table_name: string;
      rls_enabled: boolean;
    }>(
      sql.raw(`
        select c.relname as table_name,
               c.relrowsecurity as rls_enabled
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname like 'en\\_escena\\_%' escape '\\'
        order by c.relname
      `),
    );

    const rows = readRows(result);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.rls_enabled)).toEqual([]);
  });
});

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
