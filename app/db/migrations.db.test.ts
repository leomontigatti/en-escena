import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import * as schema from "./schema";

const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);
const journalPath = fileURLToPath(
  new URL("./migrations/meta/_journal.json", import.meta.url),
);
// Oráculo `pushSchema` — corre en un subproceso tsx porque `drizzle-kit/api` no
// sobrevive el transform de vite dentro de un worker de vitest.
const pushSchemaScriptPath = fileURLToPath(
  new URL("../../tests/db/push-pglite-schema.ts", import.meta.url),
);

type PgliteDatabase = ReturnType<typeof drizzle>;

async function getPublicTables(db: PgliteDatabase) {
  const result = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );

  return result.rows.map((row) => row.tablename);
}

function pushSchemaToDataDir(dataDir: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", pushSchemaScriptPath, dataDir],
    { encoding: "utf8", env: process.env },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to push the schema.");
  }
}

describe("drizzle migrations", () => {
  it("applies the baseline migration on a fresh database", async () => {
    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });

    try {
      await migrate(db, { migrationsFolder });

      const tables = await getPublicTables(db);

      expect(tables).toContain("en_escena_user");
      expect(tables).toContain("en_escena_academy");
      expect(tables).toContain("en_escena_choreography");
      expect(tables).toContain("en_escena_payment");
    } finally {
      await pglite.close();
    }
  });

  it("is a no-op when the baseline is already registered", async () => {
    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });

    try {
      await migrate(db, { migrationsFolder });

      const before = await db.execute<{ id: number }>(
        sql`select id from drizzle.__drizzle_migrations`,
      );
      expect(before.rows.length).toBeGreaterThanOrEqual(1);

      await migrate(db, { migrationsFolder });

      const after = await db.execute<{ id: number }>(
        sql`select id from drizzle.__drizzle_migrations`,
      );
      expect(after.rows).toHaveLength(before.rows.length);
    } finally {
      await pglite.close();
    }
  });

  it("registers the baseline with the hash drizzle-orm would compute", async () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const baseline = journal.entries[0];
    const baselineSql = readFileSync(
      fileURLToPath(
        new URL(`./migrations/${baseline.tag}.sql`, import.meta.url),
      ),
      "utf8",
    );
    const expectedHash = createHash("sha256").update(baselineSql).digest("hex");

    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });

    try {
      await migrate(db, { migrationsFolder });

      const rows = await db.execute<{ hash: string; created_at: string }>(
        sql`select hash, created_at from drizzle.__drizzle_migrations order by id asc`,
      );

      expect(rows.rows[0]?.hash).toBe(expectedHash);
      expect(Number(rows.rows[0]?.created_at)).toBe(baseline.when);
    } finally {
      await pglite.close();
    }
  });

  it("migrate produces the same public tables as pushSchema", async () => {
    const migratePglite = new PGlite();
    const migrateDb = drizzle(migratePglite, { schema });
    const pushDataDir = await mkdtemp(
      path.join(tmpdir(), "en-escena-pglite-oracle-"),
    );

    try {
      await migrate(migrateDb, { migrationsFolder });
      const migrateTables = await getPublicTables(migrateDb);

      pushSchemaToDataDir(pushDataDir);
      const pushPglite = new PGlite(pushDataDir);
      const pushDb = drizzle(pushPglite, { schema });

      try {
        const pushTables = await getPublicTables(pushDb);

        expect(migrateTables).toEqual(pushTables);
      } finally {
        await pushPglite.close();
      }
    } finally {
      await migratePglite.close();
      await rm(pushDataDir, { force: true, recursive: true });
    }
  });
});
