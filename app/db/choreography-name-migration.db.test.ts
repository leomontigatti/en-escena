import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import {
  choreographyNameMaxLength,
  normalizeChoreographyName,
} from "@/lib/choreographies/choreography-name";

import {
  createMigrationsFolderBefore,
  migrationsFolder,
} from "./migrations.test-support";

const nameRuleMigrationTag = "0047_choreography_name_rule";
const updatedAt = "2026-01-02T03:04:05.000Z";

function readMigrationStatements() {
  return readFileSync(
    path.join(migrationsFolder, `${nameRuleMigrationTag}.sql`),
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Runs the real migration over a database migrated up to the one before it and
 * seeded with `names`, in one transaction as the migrator does. Only the name
 * matters, so the rows it points at are never seeded and the foreign keys are
 * turned off instead.
 */
async function migrateNames(names: Record<string, string>) {
  const folder = await createMigrationsFolderBefore(nameRuleMigrationTag);
  const pglite = new PGlite();
  const warnings: string[] = [];

  try {
    await migrate(drizzle(pglite), { migrationsFolder: folder });
    await pglite.exec("set session_replication_role = replica");

    for (const [index, [id, name]] of Object.entries(names).entries()) {
      await pglite.query(
        `insert into "en_escena_choreography"
          ("id", "event_id", "academy_id", "choreography_number", "name", "modality_id", "group_type", "category_id", "category_calculation_mode", "schedule_id", "updated_at")
        values ($1, 'event_1', 'academy_1', $2, $3, 'modality_1', 'solo', 'category_1', 'oldest', 'schedule_1', $4)`,
        [id, index + 1, name, updatedAt],
      );
    }

    await pglite.transaction(async (tx) => {
      for (const statement of readMigrationStatements()) {
        await tx.exec(statement, {
          onNotice: (notice) => warnings.push(notice.message ?? ""),
        });
      }
    });

    const stored = await pglite.query<{
      id: string;
      name: string;
      updated_at: Date;
    }>(`select "id", "name", "updated_at" from "en_escena_choreography"`);
    const constraint = await pglite.query<{ convalidated: boolean }>(
      `select "convalidated" from pg_constraint where "conname" = 'choreography_name_length'`,
    );

    return {
      insert: (name: string) =>
        pglite.query(
          `insert into "en_escena_choreography"
            ("id", "event_id", "academy_id", "choreography_number", "name", "modality_id", "group_type", "category_id", "category_calculation_mode", "schedule_id")
          values ('direct', 'event_1', 'academy_1', 999, $1, 'modality_1', 'solo', 'category_1', 'oldest', 'schedule_1')`,
          [name],
        ),
      isCheckValidated: constraint.rows[0]?.convalidated,
      names: Object.fromEntries(stored.rows.map((row) => [row.id, row.name])),
      updatedAts: stored.rows.map((row) => row.updated_at.toISOString()),
      warnings,
      close: () => pglite.close(),
    };
  } catch (error) {
    await pglite.close();
    throw error;
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
}

describe("the choreography name rule migration (#764)", () => {
  it("brings the names stored before it to the form the rule stores, touching nothing else", async () => {
    const typed = {
      untrimmed: "   Los Cascanueces  ",
      doubleSpaced: "Los   Cascanueces",
      lowerCase: "los cascanueces",
      upperCase: "DANZA DE LA LUNA Y EL SOL",
      particleFirst: "la danza del fuego",
      hyphenated: "jean-pierre en parís",
      accented: "ángeles para ÉLITE ñandú",
      alreadyStored: "Sub 12 de la Casa",
    };
    const database = await migrateNames(typed);

    try {
      expect(database.names).toEqual({
        untrimmed: "Los Cascanueces",
        doubleSpaced: "Los Cascanueces",
        lowerCase: "Los Cascanueces",
        upperCase: "Danza de la Luna y el Sol",
        particleFirst: "La Danza del Fuego",
        hyphenated: "Jean-Pierre en París",
        accented: "Ángeles para Élite Ñandú",
        alreadyStored: "Sub 12 de la Casa",
      });
      // The SQL is a second statement of the rule: it must agree with the one
      // every write goes through from now on.
      expect(database.names).toEqual(
        Object.fromEntries(
          Object.entries(typed).map(([id, name]) => [
            id,
            normalizeChoreographyName(name),
          ]),
        ),
      );
      expect(new Set(database.updatedAts)).toEqual(new Set([updatedAt]));
      expect(database.warnings).toEqual([]);
      expect(database.isCheckValidated).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("leaves a name without a letter or digit as it is and reports it", async () => {
    const database = await migrateNames({
      contentless: "  !!!  ",
      fine: "los cascanueces",
    });

    try {
      expect(database.names).toEqual({
        contentless: "  !!!  ",
        fine: "Los Cascanueces",
      });
      expect(database.warnings).toEqual([
        expect.stringContaining("Choreography contentless keeps a name"),
      ]);
      expect(database.isCheckValidated).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("normalizes a name over the ceiling, reports it and leaves the CHECK unvalidated instead of stopping the deploy", async () => {
    const overCeiling = `los ${"a".repeat(choreographyNameMaxLength)}`;
    const database = await migrateNames({ overCeiling });

    try {
      expect(database.names).toEqual({
        overCeiling: `Los A${"a".repeat(choreographyNameMaxLength - 1)}`,
      });
      expect(database.warnings).toEqual([
        expect.stringContaining("Choreography overCeiling keeps a name"),
        expect.stringContaining("left NOT VALID"),
      ]);
      expect(database.isCheckValidated).toBe(false);
      // Unvalidated, it still refuses every new write.
      await expect(
        database.insert("a".repeat(choreographyNameMaxLength + 1)),
      ).rejects.toThrow(/choreography_name_length/);
    } finally {
      await database.close();
    }
  });

  it("makes the database refuse a name over the ceiling or blank, and accept one at it", async () => {
    const database = await migrateNames({});

    try {
      await expect(
        database.insert("a".repeat(choreographyNameMaxLength + 1)),
      ).rejects.toThrow(/choreography_name_length/);
      await expect(database.insert("   ")).rejects.toThrow(
        /choreography_name_length/,
      );
      await expect(
        database.insert("a".repeat(choreographyNameMaxLength)),
      ).resolves.toBeDefined();
    } finally {
      await database.close();
    }
  });
});
