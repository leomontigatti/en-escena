import { rm } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMigrationsFolderBefore,
  migrationsFolder,
} from "./migrations.test-support";

const anchorMigrationTag = "0022_add_comprobante_seminar_anchor";

type Database = ReturnType<typeof drizzle>;

/**
 * Two comprobantes of two academies, exactly as production holds them before
 * the second anchor exists: every row names a choreography and none names an
 * academy, because the column is not there yet. The academies are real rows —
 * the migration adds a foreign key to them, and adding one validates what is
 * already stored — while everything else is seeded with the foreign keys off so
 * as not to stand up half the database for two invoices.
 */
async function seedChoreographyComprobantes(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_academy"
      ("id", "user_id", "name", "contact_name", "phone")
    values
      ('academy_bailando', 'user_1', 'Academia Bailando', 'Ana', '3510000001'),
      ('academy_mirando', 'user_2', 'Academia Mirando', 'Bruno', '3510000002')
  `);
  await db.execute(sql`
    insert into "en_escena_choreography"
      ("id", "event_id", "academy_id", "choreography_number", "name",
       "modality_id", "group_type", "category_id", "category_calculation_mode",
       "schedule_id", "has_presentation")
    values
      ('choreography_aire', 'event_1', 'academy_bailando', 1, 'Aire',
       'modality_1', 'solo', 'category_1', 'oldest', 'schedule_1', false),
      ('choreography_tierra', 'event_1', 'academy_mirando', 2, 'Tierra',
       'modality_1', 'solo', 'category_1', 'oldest', 'schedule_1', false)
  `);
  await db.execute(sql`
    insert into "en_escena_comprobante"
      ("id", "choreography_id", "event_id", "cbte_tipo", "pto_vta", "cbte_nro",
       "cbte_fch", "imp_total", "issuer_cuit", "issuer_iva_condition",
       "receptor_doc_tipo", "receptor_doc_nro", "receptor_iva_condition_id",
       "cae", "cae_vto")
    values
      ('comprobante_aire', 'choreography_aire', 'event_1', 11, 1, 43,
       '20260722', 10000, '30717611590', 'exento',
       99, '0', 5,
       '41124578989845', '20260801'),
      ('comprobante_tierra', 'choreography_tierra', 'event_1', 11, 1, 44,
       '20260722', 20000, '30717611590', 'exento',
       99, '0', 5,
       '41124578989846', '20260801')
  `);
}

/**
 * The one irreversible, data-touching statement of the seminar-anchor slice: the
 * `academy_id` column arrives nullable, is backfilled from each row's anchor
 * choreography, and is only then tightened to NOT NULL. The DB suite pushes the
 * schema from the snapshot rather than replaying the migrations, so the backfill
 * has no coverage unless a test replays it — which is what this one does, the
 * same way the allocation-merge and snapshot-drop migrations are covered.
 */
describe("the comprobante anchor migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(anchorMigrationTag);
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("gives every existing choreography comprobante the academy of its choreography", async () => {
    await seedChoreographyComprobantes(db);

    await migrate(db, { migrationsFolder });

    const comprobantesAfter = await db.execute<{
      id: string;
      academy_id: string;
      choreography_id: string | null;
      seminar_id: string | null;
    }>(sql`
      select "id", "academy_id", "choreography_id", "seminar_id"
      from "en_escena_comprobante"
      order by "id"
    `);

    // Per row and not per table: the backfill joins each comprobante to its own
    // choreography, so two academies do not collapse into one.
    expect(comprobantesAfter.rows).toEqual([
      {
        id: "comprobante_aire",
        academy_id: "academy_bailando",
        choreography_id: "choreography_aire",
        seminar_id: null,
      },
      {
        id: "comprobante_tierra",
        academy_id: "academy_mirando",
        choreography_id: "choreography_tierra",
        seminar_id: null,
      },
    ]);
  });

  it("lands the NOT NULL on a full column and keeps the anchor CHECK", async () => {
    await seedChoreographyComprobantes(db);

    await migrate(db, { migrationsFolder });

    const academyColumn = await db.execute<{ is_nullable: string }>(sql`
      select "is_nullable"
      from "information_schema"."columns"
      where "table_name" = 'en_escena_comprobante'
        and "column_name" = 'academy_id'
    `);
    expect(academyColumn.rows).toEqual([{ is_nullable: "NO" }]);

    // A backfilled row still satisfies the CHECK the same migration adds: it
    // names exactly one anchor, and the second one stays null.
    const anchorlessInsert = await db
      .execute(
        sql`
          insert into "en_escena_comprobante"
            ("id", "choreography_id", "seminar_id", "academy_id", "event_id",
             "cbte_tipo", "pto_vta", "cbte_nro", "cbte_fch", "imp_total",
             "issuer_cuit", "issuer_iva_condition", "receptor_doc_tipo",
             "receptor_doc_nro", "receptor_iva_condition_id", "cae", "cae_vto")
          values
            ('comprobante_sin_ancla', null, null, 'academy_bailando', 'event_1',
             11, 1, 45, '20260722', 30000,
             '30717611590', 'exento', 99,
             '0', 5, '41124578989847', '20260801')
        `,
      )
      .catch((error: unknown) => error);

    expect(anchorlessInsert).toBeInstanceOf(Error);
  });
});
