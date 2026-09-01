import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";

// RLS is enabled on the older tables, but it protects nothing: there is not a
// single `CREATE POLICY` against an app that connects as the table owner. It
// was only ever there to mute a Supabase warning, and Supabase is gone. #506
// removes the vestige repo-wide; until then new tables are declared without it
// rather than adding to the pile, so this test asserts the current state
// instead of a rule nobody is enforcing.
const tablesWithoutRowLevelSecurity = ["en_escena_event_document"];

describe("database schema security", () => {
  test("enables row-level security on every En Escena public table that declares it", async () => {
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
    expect(
      rows
        .filter((row) => !row.rls_enabled)
        .map((row) => row.table_name)
        .sort(),
    ).toEqual([...tablesWithoutRowLevelSecurity].sort());
  });
});

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
