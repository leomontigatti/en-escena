import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";

import { installDatabaseTestHooks } from "./harness";
import { readRows, resetDatabaseTables } from "./reset";

installDatabaseTestHooks();

const probeSequenceName = "en_escena_reset_probe_seq";

// Deliberately re-derives the probe instead of reusing `buildProbeQuery`, so
// the assertions are an independent oracle rather than a restatement of the
// code under test.
async function countRowsInEnEscenaTables() {
  const result = await db.execute<{ dirty: string }>(
    sql.raw(`
      select tablename as dirty
      from pg_tables
      where schemaname = 'public'
        and tablename like 'en\\_escena\\_%' escape '\\'
    `),
  );
  const tableNames = readRows<{ dirty: string }>(result).map(
    (row) => row.dirty,
  );
  const dirty: string[] = [];

  for (const tableName of tableNames) {
    const rows = await db.execute<{ present: number }>(
      sql.raw(`select 1 as present from "${tableName}" limit 1`),
    );

    if (readRows(rows).length > 0) {
      dirty.push(tableName);
    }
  }

  return dirty;
}

async function readSequenceLastValue() {
  const result = await db.execute<{ last_value: number | null }>(
    sql.raw(`
      select last_value
      from pg_sequences
      where schemaname = 'public' and sequencename = '${probeSequenceName}'
    `),
  );
  return readRows<{ last_value: number | null }>(result)[0]?.last_value ?? null;
}

describe("the per-test database reset", () => {
  test("leaves every en_escena_ table empty", async () => {
    await db.insert(user).values({
      id: "user_1",
      name: "Academia Test",
      email: "academia@example.com",
    });

    await resetDatabaseTables(db, db);

    expect(await countRowsInEnEscenaTables()).toEqual([]);
  });

  test("rewinds a sequence even when the rows that advanced it are gone", async () => {
    await db.execute(sql.raw(`create sequence "${probeSequenceName}"`));

    try {
      await db.execute(sql.raw(`select nextval('${probeSequenceName}')`));

      expect(await readSequenceLastValue()).not.toBeNull();

      await resetDatabaseTables(db, db);

      expect(await readSequenceLastValue()).toBeNull();
    } finally {
      await db.execute(sql.raw(`drop sequence "${probeSequenceName}"`));
    }
  });

  test("is a no-op on an already empty database", async () => {
    await resetDatabaseTables(db, db);

    expect(await countRowsInEnEscenaTables()).toEqual([]);
  });

  test("reads the catalog again after a reset that failed mid-plan", async () => {
    const planOwner = {};
    let attempts = 0;
    const flaky = {
      execute: async (query: SQL) => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("connection lost");
        }

        return db.execute(query);
      },
    };

    await expect(resetDatabaseTables(flaky, planOwner)).rejects.toThrow(
      "connection lost",
    );

    await expect(
      resetDatabaseTables(flaky, planOwner),
    ).resolves.toBeUndefined();
  });
});
