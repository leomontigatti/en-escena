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

const snapshotDropTag = "0009_drop_inscription_snapshot_columns";

const droppedColumns = [
  "applied_dancer_discount_amount",
  "applied_dancer_discount_percentage",
  "balance_amount",
  "balance_completed_at",
  "balance_reference_date",
  "deposit_amount",
  "deposit_percentage",
  "deposit_reference_date",
  "final_total_amount",
  "frozen_base_price_amount",
];

type Database = ReturnType<typeof drizzle>;

async function readChoreographyDancerColumns(db: Database) {
  const result = await db.execute<{ column_name: string }>(sql`
    select "column_name"
    from "information_schema"."columns"
    where "table_name" = 'en_escena_choreography_dancer'
    order by "column_name"
  `);

  return result.rows.map((row) => row.column_name);
}

/**
 * Production-shaped rows, following the 2026-08-05 baseline #555 recorded
 * against production: 340 inscriptions carrying a `selected_price_id`, 24
 * carrying none, and the pre-#676 ones still holding real frozen values. Foreign
 * keys are off so that three inscriptions do not require seeding half the
 * database.
 */
async function seedProductionShapedRows(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_price"
      ("id", "event_id", "name", "group_type", "amount", "payment_deadline")
    values ('price_solo', 'event_1', 'Precio Solo', 'solo', 12000, '2026-10-10')
  `);
  await db.execute(sql`
    insert into "en_escena_choreography_dancer"
      ("id", "choreography_id", "dancer_id", "age_at_event_start",
       "selected_price_id", "frozen_base_price_amount",
       "deposit_reference_date", "deposit_percentage", "deposit_amount",
       "balance_reference_date", "applied_dancer_discount_percentage",
       "applied_dancer_discount_amount", "final_total_amount",
       "balance_amount", "balance_completed_at")
    values
      -- Legacy fully-paid row: every snapshot column carries a real value, and
      -- the frozen amount agrees with its price row.
      ('inscription_paid', 'choreography_1', 'dancer_1', 14,
       'price_solo', 12000,
       '2026-03-20', 30, 3600,
       '2026-03-23', 0,
       0, 12000,
       8400, '2026-03-23'),
      -- Legacy deposit-only row: the deposit half of the ladder, nothing else.
      ('inscription_signed', 'choreography_1', 'dancer_2', 15,
       'price_solo', 12000,
       '2026-03-20', 30, 3600,
       null, null,
       null, null,
       null, null),
      -- One of the 24 rows with no selected price and no frozen amount.
      ('inscription_unpaid', 'choreography_1', 'dancer_3', 16,
       null, null,
       null, null, null,
       null, null,
       null, null,
       null, null)
  `);
}

describe("the inscription snapshot drop migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(snapshotDropTag);
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("drops exactly the ten snapshot columns and leaves selected_price_id untouched", async () => {
    await seedProductionShapedRows(db);

    const columnsBefore = await readChoreographyDancerColumns(db);
    expect(columnsBefore).toEqual(expect.arrayContaining(droppedColumns));

    await migrate(db, { migrationsFolder });

    const columnsAfter = await readChoreographyDancerColumns(db);
    expect(columnsAfter).toEqual(
      columnsBefore.filter((column) => !droppedColumns.includes(column)),
    );
    expect(columnsAfter).toContain("selected_price_id");

    const inscriptions = await db.execute<{
      id: string;
      selected_price_id: string | null;
    }>(sql`
      select "id", "selected_price_id"
      from "en_escena_choreography_dancer"
      order by "id"
    `);

    expect(inscriptions.rows).toEqual([
      { id: "inscription_paid", selected_price_id: "price_solo" },
      { id: "inscription_signed", selected_price_id: "price_solo" },
      { id: "inscription_unpaid", selected_price_id: null },
    ]);
  });

  it.each([
    {
      /**
       * The `frozen_sin_price_id` class of #555: a frozen amount with no price
       * row behind it, so the derived model has nothing to reproduce it from.
       */
      name: "a frozen base price with no selected price",
      selectedPriceId: null,
      frozenBasePriceAmount: 12000,
    },
    {
      /**
       * The `frozen_distinto_precio` class: decision 6 of map #547 assumed every frozen
       * amount equals its price row's current amount. This row disproves it.
       */
      name: "a frozen base price that disagrees with its price row",
      selectedPriceId: "price_solo",
      frozenBasePriceAmount: 9500,
    },
  ])("aborts on $name, leaving the columns in place", async (scenario) => {
    await seedProductionShapedRows(db);
    await db.execute(sql`
      insert into "en_escena_choreography_dancer"
        ("id", "choreography_id", "dancer_id", "age_at_event_start",
         "selected_price_id", "frozen_base_price_amount")
      values
        ('inscription_offending', 'choreography_1', 'dancer_9', 17,
         ${scenario.selectedPriceId}, ${scenario.frozenBasePriceAmount})
    `);

    const migrationError = await migrate(db, { migrationsFolder }).catch(
      (error: unknown) => error,
    );

    expect(migrationError).toBeInstanceOf(Error);
    expect((migrationError as Error).message).toContain(
      "Cannot drop the inscription snapshot columns",
    );

    // The migration runs in one transaction, so the abort takes the drops with
    // it: the columns and their data are still there for the operator to inspect.
    const columnsAfter = await readChoreographyDancerColumns(db);
    expect(columnsAfter).toEqual(expect.arrayContaining(droppedColumns));

    const surviving = await db.execute<{ deposit_reference_date: string }>(sql`
      select "deposit_reference_date"
      from "en_escena_choreography_dancer"
      where "id" = 'inscription_paid'
    `);
    expect(surviving.rows).toEqual([{ deposit_reference_date: "2026-03-20" }]);
  });
});
