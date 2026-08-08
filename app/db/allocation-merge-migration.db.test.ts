import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);
const allocationMigrationTag = "0007_strange_mantis";

/**
 * La fusión de los pares corre DENTRO de la migración que colapsa la asignación,
 * y su precedencia es dura: si el índice único se crea antes, la migración falla
 * sobre los duplicados. Para verificar las dos mitades sin copiar su SQL, este
 * test migra la base hasta la migración anterior, siembra la forma del par y
 * ejecuta las sentencias reales del archivo.
 */
function readMigrationStatements(tag: string) {
  return readFileSync(path.join(migrationsFolder, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((statement) => statement.length > 0);
}

function withoutComments(statement: string) {
  return statement
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

/**
 * Carpeta de migraciones recortada hasta —sin incluir— `tag`: el journal manda,
 * así que basta con filtrar sus entradas y copiar los `.sql` que quedan.
 */
async function createMigrationsFolderBefore(tag: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "en-escena-migrations-"));
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };

  const entries = journal.entries.slice(
    0,
    journal.entries.findIndex((entry) => entry.tag === tag),
  );

  await cp(path.join(migrationsFolder, "meta"), path.join(folder, "meta"), {
    recursive: true,
  });
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await cp(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }

  return folder;
}

const pairPaymentId = "payment_pair";
const pairInscriptionId = "inscription_pair";

async function seedPairShape(db: ReturnType<typeof drizzle>) {
  // Sólo interesa la tabla de asignaciones: las foreign keys se apagan para no
  // sembrar media base por dos filas.
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_payment_allocation"
      ("id", "payment_id", "inscription_id", "academy_id", "event_id", "allocation_type", "amount", "created_at")
    values
      ('allocation_deposit', ${pairPaymentId}, ${pairInscriptionId}, 'academy_1', 'event_1', 'deposit', 3000, '2026-03-01T00:00:00Z'),
      ('allocation_balance', ${pairPaymentId}, ${pairInscriptionId}, 'academy_1', 'event_1', 'balance', 7000, '2026-04-01T00:00:00Z'),
      ('allocation_lone', 'payment_lone', 'inscription_lone', 'academy_1', 'event_1', 'deposit', 2500, '2026-03-01T00:00:00Z')
  `);
}

describe("the allocation-collapse migration", () => {
  it("merges each pair into its older row before the unique index can exist", async () => {
    const folderBefore = await createMigrationsFolderBefore(
      allocationMigrationTag,
    );
    const pglite = new PGlite();
    const db = drizzle(pglite);
    const statements = readMigrationStatements(allocationMigrationTag);
    const mergeStatements = statements
      .map(withoutComments)
      .filter(
        (statement) =>
          statement.startsWith("WITH survivors") ||
          statement.startsWith("DELETE FROM"),
      );
    const createUniqueIndex = statements.find((statement) =>
      statement.startsWith("CREATE UNIQUE INDEX"),
    );

    expect(mergeStatements).toHaveLength(2);
    expect(createUniqueIndex).toBeDefined();

    try {
      await migrate(db, { migrationsFolder: folderBefore });
      await seedPairShape(db);

      // Antes de la fusión el índice único no puede existir: los 62 pares de
      // producción son exactamente esta forma.
      const indexError = await db
        .transaction((tx) => tx.execute(sql.raw(createUniqueIndex!)))
        .catch((error) => error);
      expect(indexError).toBeInstanceOf(Error);

      for (const statement of mergeStatements) {
        await db.execute(sql.raw(statement));
      }

      const merged = await db.execute<{
        id: string;
        amount: number;
        payment_id: string;
      }>(
        sql`select "id", "amount", "payment_id" from "en_escena_payment_allocation" order by "id"`,
      );

      // Un sobreviviente por par —el de `created_at` más viejo—, con la suma
      // encima, y la fila suelta intacta.
      expect(merged.rows).toEqual([
        expect.objectContaining({ id: "allocation_deposit", amount: 10000 }),
        expect.objectContaining({ id: "allocation_lone", amount: 2500 }),
      ]);

      // Y ahora sí, el índice único entra limpio.
      await db.execute(sql.raw(createUniqueIndex!));
    } finally {
      await pglite.close();
      await rm(folderBefore, { force: true, recursive: true });
    }
  });
});
