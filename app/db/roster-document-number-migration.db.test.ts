import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/shared/error-properties.server";

import {
  createMigrationsFolderBefore,
  migrationsFolder,
} from "./migrations.test-support";

const documentNumberMigrationTag = "0031_roster_document_number_unique";

/**
 * The guard against an already-duplicated pair runs INSIDE the migration that
 * keys the roster on the document number, so the test runs the file's real
 * statements over a database seeded with the shape the guard refuses.
 */
function readMigrationStatements(tag: string) {
  return readFileSync(path.join(migrationsFolder, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((statement) => statement.length > 0);
}

// Only the roster tables matter here, so the academies they point at are never
// seeded and their foreign keys are turned off instead.
async function detachForeignKeys(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`set session_replication_role = replica`);
}

async function insertDancer(
  db: ReturnType<typeof drizzle>,
  values: {
    id: string;
    academyId: string;
    documentType: string;
    documentNumber: string;
  },
) {
  await db.execute(sql`
    insert into "en_escena_dancer"
      ("id", "academy_id", "first_name", "last_name", "birth_date", "document_type", "document_number")
    values
      (${values.id}, ${values.academyId}, 'Ana', 'Alvarez', '2014-02-01', ${values.documentType}, ${values.documentNumber})
  `);
}

async function insertProfessor(
  db: ReturnType<typeof drizzle>,
  values: {
    id: string;
    academyId: string;
    documentType: string;
    documentNumber: string;
  },
) {
  await db.execute(sql`
    insert into "en_escena_professor"
      ("id", "academy_id", "first_name", "last_name", "document_type", "document_number")
    values
      (${values.id}, ${values.academyId}, 'Beatriz', 'Suarez', ${values.documentType}, ${values.documentNumber})
  `);
}

async function withMigratedDatabase(
  run: (db: ReturnType<typeof drizzle>) => Promise<void>,
  options: { upToPrevious?: boolean } = {},
) {
  const folder = options.upToPrevious
    ? await createMigrationsFolderBefore(documentNumberMigrationTag)
    : migrationsFolder;
  const pglite = new PGlite();
  const db = drizzle(pglite);

  try {
    await migrate(db, { migrationsFolder: folder });
    await run(db);
  } finally {
    await pglite.close();
    if (options.upToPrevious) {
      await rm(folder, { force: true, recursive: true });
    }
  }
}

describe("the roster document-number migration", () => {
  it("raises before creating the indexes when a violating pair exists", async () => {
    await withMigratedDatabase(
      async (db) => {
        await detachForeignKeys(db);
        // The pair the old index let through: one number, two types.
        await insertDancer(db, {
          id: "dancer_dni",
          academyId: "academy_1",
          documentType: "dni",
          documentNumber: "30111222",
        });
        await insertDancer(db, {
          id: "dancer_other",
          academyId: "academy_1",
          documentType: "other",
          documentNumber: "30111222",
        });

        const [guard] = readMigrationStatements(documentNumberMigrationTag);
        const guardError = await db
          .transaction((tx) => tx.execute(sql.raw(guard)))
          .catch((error: unknown) => error);

        expect(guardError).toBeInstanceOf(Error);
        expect(String(guardError)).toContain("Cannot key dancers");

        // The old index is still there: the migration stopped before it.
        const indexes = await db.execute<{ indexname: string }>(
          sql`select "indexname" from pg_indexes where "indexname" = 'dancer_academy_document_unique'`,
        );

        expect(indexes.rows).toHaveLength(1);
      },
      { upToPrevious: true },
    );
  });

  it("raises when two professors of an academy share a number", async () => {
    await withMigratedDatabase(
      async (db) => {
        await detachForeignKeys(db);
        await insertProfessor(db, {
          id: "professor_dni",
          academyId: "academy_1",
          documentType: "dni",
          documentNumber: "30111222",
        });
        await insertProfessor(db, {
          id: "professor_other",
          academyId: "academy_1",
          documentType: "other",
          documentNumber: "30111222",
        });

        const [guard] = readMigrationStatements(documentNumberMigrationTag);
        const guardError = await db
          .transaction((tx) => tx.execute(sql.raw(guard)))
          .catch((error: unknown) => error);

        expect(guardError).toBeInstanceOf(Error);
        expect(String(guardError)).toContain("Cannot key professors");
      },
      { upToPrevious: true },
    );
  });

  it("refuses a second dancer with the same number under another type", async () => {
    await withMigratedDatabase(async (db) => {
      await detachForeignKeys(db);
      await insertDancer(db, {
        id: "dancer_dni",
        academyId: "academy_1",
        documentType: "dni",
        documentNumber: "30111222",
      });

      const duplicateError = await insertDancer(db, {
        id: "dancer_other",
        academyId: "academy_1",
        documentType: "other",
        documentNumber: "30111222",
      }).catch((error: unknown) => error);

      expect(
        isUniqueViolation(
          duplicateError,
          "dancer_academy_document_number_unique",
        ),
      ).toBe(true);
    });
  });

  it("accepts the same number in another academy, and on a professor of the same one", async () => {
    await withMigratedDatabase(async (db) => {
      await detachForeignKeys(db);
      await insertDancer(db, {
        id: "dancer_1",
        academyId: "academy_1",
        documentType: "dni",
        documentNumber: "30111222",
      });
      await insertDancer(db, {
        id: "dancer_2",
        academyId: "academy_2",
        documentType: "dni",
        documentNumber: "30111222",
      });
      // A teacher who also dances is one dancer row and one professor row.
      await insertProfessor(db, {
        id: "professor_1",
        academyId: "academy_1",
        documentType: "dni",
        documentNumber: "30111222",
      });

      const dancerCount = await db.execute<{ count: string }>(
        sql`select count(*)::text as "count" from "en_escena_dancer"`,
      );

      expect(dancerCount.rows[0]?.count).toBe("2");
    });
  });

  it("keeps an archived dancer in the index", async () => {
    await withMigratedDatabase(async (db) => {
      await detachForeignKeys(db);
      await insertDancer(db, {
        id: "dancer_archived",
        academyId: "academy_1",
        documentType: "dni",
        documentNumber: "30111222",
      });
      await db.execute(
        sql`update "en_escena_dancer" set "active" = false where "id" = 'dancer_archived'`,
      );

      const duplicateError = await insertDancer(db, {
        id: "dancer_active",
        academyId: "academy_1",
        documentType: "dni",
        documentNumber: "30111222",
      }).catch((error: unknown) => error);

      expect(
        isUniqueViolation(
          duplicateError,
          "dancer_academy_document_number_unique",
        ),
      ).toBe(true);
    });
  });
});
