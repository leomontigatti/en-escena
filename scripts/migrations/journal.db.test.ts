import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { getTestDatabaseUrl } from "../../tests/db/config";

import {
  findJournalInconsistencies,
  readHashedJournalEntries,
} from "./journal.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const isPglite = process.env.DB_TEST_BACKEND === "pglite";

type SyntheticMigration = { tag: string; when: number; sql: string };

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/**
 * Writes a migrations folder in the layout `drizzle-kit generate` produces, so
 * both migrators read exactly what they read in production.
 */
function writeMigrationsFolder(migrations: SyntheticMigration[]) {
  const folder = mkdtempSync(path.join(tmpdir(), "enescena-journal-"));
  temporaryDirectories.push(folder);
  mkdirSync(path.join(folder, "meta"));

  for (const migration of migrations) {
    writeFileSync(path.join(folder, `${migration.tag}.sql`), migration.sql);
  }

  writeFileSync(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: migrations.map((migration, index) => ({
        idx: index,
        version: "7",
        when: migration.when,
        tag: migration.tag,
        breakpoints: true,
      })),
    }),
  );

  return folder;
}

function createTableMigration(schemaName: string, tableName: string) {
  return [
    `create schema if not exists "${schemaName}";`,
    "--> statement-breakpoint",
    `create table if not exists "${schemaName}"."${tableName}" (id integer primary key);`,
  ].join("\n");
}

describe("drizzle's migration watermark", () => {
  async function applyAndReadJournal(
    migrations: SyntheticMigration[],
    pglite: PGlite,
  ) {
    const folder = writeMigrationsFolder(migrations);
    await migratePglite(drizzlePglite(pglite), { migrationsFolder: folder });

    const applied = await pglite.query<{ hash: string; created_at: string }>(
      "select hash, created_at from drizzle.__drizzle_migrations",
    );

    return {
      folder,
      appliedMigrations: applied.rows.map((row) => ({
        hash: row.hash,
        createdAt: Number(row.created_at),
      })),
    };
  }

  it("never applies a migration merged with a timestamp below the watermark", async () => {
    const pglite = new PGlite();

    try {
      await applyAndReadJournal(
        [
          {
            tag: "0000_first",
            when: 100,
            sql: createTableMigration("wm", "a"),
          },
          {
            tag: "0002_third",
            when: 300,
            sql: createTableMigration("wm", "c"),
          },
        ],
        pglite,
      );

      // 0001 is merged afterwards, carrying an older timestamp — the shape an
      // out-of-order merge of parallel PRs produces.
      const { folder, appliedMigrations } = await applyAndReadJournal(
        [
          {
            tag: "0000_first",
            when: 100,
            sql: createTableMigration("wm", "a"),
          },
          {
            tag: "0001_second",
            when: 200,
            sql: createTableMigration("wm", "b"),
          },
          {
            tag: "0002_third",
            when: 300,
            sql: createTableMigration("wm", "c"),
          },
        ],
        pglite,
      );

      const tables = await pglite.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'wm' order by tablename",
      );

      // The skip is silent: migrate() reported success and left no trace.
      expect(tables.rows.map((row) => row.tablename)).toEqual(["a", "c"]);

      expect(
        findJournalInconsistencies({
          entries: readHashedJournalEntries(folder),
          appliedMigrations,
        }),
      ).toEqual([{ tag: "0001_second", when: 200, reason: "not-applied" }]);
    } finally {
      await pglite.close();
    }
  });

  it("does not notice a migration file edited after it was applied", async () => {
    const pglite = new PGlite();

    try {
      await applyAndReadJournal(
        [
          {
            tag: "0000_first",
            when: 100,
            sql: createTableMigration("ed", "a"),
          },
        ],
        pglite,
      );

      const { folder, appliedMigrations } = await applyAndReadJournal(
        [
          {
            tag: "0000_first",
            when: 100,
            sql: `${createTableMigration("ed", "a")}\n-- edited after the fact`,
          },
        ],
        pglite,
      );

      expect(
        findJournalInconsistencies({
          entries: readHashedJournalEntries(folder),
          appliedMigrations,
        }),
      ).toEqual([{ tag: "0000_first", when: 100, reason: "hash-mismatch" }]);
    } finally {
      await pglite.close();
    }
  });
});

/**
 * `pnpm db:migrate` (drizzle-kit) stays the local command while the container
 * entrypoint uses the drizzle-orm migrator, so the two must agree on what
 * counts as applied. The baseline already bets on this equivalence:
 * `scripts/baseline-migrations.ts` writes a row the way drizzle-orm computes it
 * so that drizzle-kit skips it. These tests turn that assumption into a gate.
 *
 * Real Postgres only — drizzle-kit has no PGlite driver.
 */
describe.skipIf(isPglite)(
  "drizzle-kit and drizzle-orm agree on the journal",
  () => {
    const databaseUrl = getTestDatabaseUrl();

    function runDrizzleKitMigrate(
      migrationsFolder: string,
      journalSchema: string,
    ) {
      const configDirectory = mkdtempSync(path.join(tmpdir(), "enescena-kit-"));
      temporaryDirectories.push(configDirectory);
      const configPath = path.join(configDirectory, "drizzle.config.ts");

      writeFileSync(
        configPath,
        // A plain object rather than `defineConfig`: the config lives outside the
        // repo, so it cannot resolve `drizzle-kit` itself.
        [
          `export default {`,
          `  dialect: "postgresql",`,
          `  out: ${JSON.stringify(migrationsFolder)},`,
          `  dbCredentials: { url: ${JSON.stringify(databaseUrl)} },`,
          `  migrations: { schema: ${JSON.stringify(journalSchema)} },`,
          `};`,
        ].join("\n"),
      );

      const result = spawnSync(
        process.execPath,
        ["node_modules/drizzle-kit/bin.cjs", "migrate", "--config", configPath],
        { cwd: repoRoot, encoding: "utf8", env: process.env },
      );

      if (result.status !== 0) {
        throw new Error(
          result.stderr || result.stdout || "drizzle-kit failed.",
        );
      }
    }

    async function readJournalRows(
      client: ReturnType<typeof postgres>,
      journalSchema: string,
    ) {
      const rows = await client.unsafe(
        `select hash, created_at from "${journalSchema}".__drizzle_migrations order by created_at asc`,
      );

      return rows.map((row) => ({
        hash: String(row.hash),
        createdAt: Number(row.created_at),
      }));
    }

    async function withScratchSchemas(
      names: string[],
      run: (client: ReturnType<typeof postgres>) => Promise<void>,
    ) {
      const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

      try {
        await run(client);
      } finally {
        for (const name of names) {
          await client.unsafe(`drop schema if exists "${name}" cascade`);
        }

        await client.end();
      }
    }

    it("records the same hash and timestamp for the same migrations", async () => {
      const kitJournalSchema = "kit_journal";
      const ormJournalSchema = "orm_journal";
      // Byte-identical SQL for both runners, so the hashes are directly
      // comparable. `if not exists` makes the second run's DDL a no-op while
      // still writing its own journal row.
      const migrations: SyntheticMigration[] = [
        {
          tag: "0000_first",
          when: 100,
          sql: createTableMigration("kit_orm", "a"),
        },
        {
          tag: "0001_second",
          when: 200,
          sql: createTableMigration("kit_orm", "b"),
        },
      ];

      await withScratchSchemas(
        [kitJournalSchema, ormJournalSchema, "kit_orm"],
        async (client) => {
          runDrizzleKitMigrate(
            writeMigrationsFolder(migrations),
            kitJournalSchema,
          );
          await migratePostgres(drizzlePostgres(client), {
            migrationsFolder: writeMigrationsFolder(migrations),
            migrationsSchema: ormJournalSchema,
          });

          const kitRows = await readJournalRows(client, kitJournalSchema);
          const ormRows = await readJournalRows(client, ormJournalSchema);

          expect(kitRows.map((row) => row.createdAt)).toEqual([100, 200]);
          // The pair (hash, created_at) is the identity both migrators compare
          // on, and `scripts/baseline-migrations.ts` already bets on them
          // agreeing.
          expect(kitRows).toEqual(ormRows);
        },
      );
    });

    it("both skip a migration merged below the watermark", async () => {
      const kitJournalSchema = "kit_stale_journal";
      const ormJournalSchema = "orm_stale_journal";

      const applied = (prefix: string): SyntheticMigration[] => [
        {
          tag: "0000_first",
          when: 100,
          sql: createTableMigration(prefix, "a"),
        },
        {
          tag: "0002_third",
          when: 300,
          sql: createTableMigration(prefix, "c"),
        },
      ];
      const withStaleEntry = (prefix: string): SyntheticMigration[] => [
        {
          tag: "0000_first",
          when: 100,
          sql: createTableMigration(prefix, "a"),
        },
        {
          tag: "0001_second",
          when: 200,
          sql: createTableMigration(prefix, "b"),
        },
        {
          tag: "0002_third",
          when: 300,
          sql: createTableMigration(prefix, "c"),
        },
      ];

      await withScratchSchemas(
        [kitJournalSchema, ormJournalSchema, "stale_kit", "stale_orm"],
        async (client) => {
          runDrizzleKitMigrate(
            writeMigrationsFolder(applied("stale_kit")),
            kitJournalSchema,
          );
          runDrizzleKitMigrate(
            writeMigrationsFolder(withStaleEntry("stale_kit")),
            kitJournalSchema,
          );

          const ormDb = drizzlePostgres(client);
          await migratePostgres(ormDb, {
            migrationsFolder: writeMigrationsFolder(applied("stale_orm")),
            migrationsSchema: ormJournalSchema,
          });
          await migratePostgres(ormDb, {
            migrationsFolder: writeMigrationsFolder(
              withStaleEntry("stale_orm"),
            ),
            migrationsSchema: ormJournalSchema,
          });

          const kitTables = await client.unsafe(
            `select tablename from pg_tables where schemaname = 'stale_kit' order by tablename`,
          );
          const ormTables = await client.unsafe(
            `select tablename from pg_tables where schemaname = 'stale_orm' order by tablename`,
          );

          expect(kitTables.map((row) => row.tablename)).toEqual(["a", "c"]);
          expect(ormTables.map((row) => row.tablename)).toEqual(["a", "c"]);

          const kitRows = await readJournalRows(client, kitJournalSchema);
          const ormRows = await readJournalRows(client, ormJournalSchema);

          expect(kitRows.map((row) => row.createdAt)).toEqual([100, 300]);
          expect(ormRows.map((row) => row.createdAt)).toEqual([100, 300]);
        },
      );
    });
  },
);
