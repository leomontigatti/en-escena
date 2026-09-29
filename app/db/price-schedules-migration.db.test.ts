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

const priceSchedulesMigrationTag = "0036_price_schedules";

type Database = ReturnType<typeof drizzle>;

/**
 * Prices as production holds them the instant before the join table exists: a
 * dated and a deadline-less general row, and two special rows on two schedules,
 * one of them deadline-less.
 */
async function seedPricesWithOneSchedule(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_event" ("id", "name", "starts_at", "ends_at")
    values ('event_1', 'Certamen', now() + interval '30 days', now() + interval '32 days')
  `);
  await db.execute(sql`
    insert into "en_escena_schedule"
      ("id", "event_id", "name", "scheduled_date", "start_time", "total_capacity")
    values
      ('schedule_all', 'event_1', 'En Escena All', '2026-10-10', '12:00', 40),
      ('schedule_aereas', 'event_1', 'Acrobacias Aéreas', '2026-10-10', '18:00', 40)
  `);
  await db.execute(sql`
    insert into "en_escena_price"
      ("id", "name", "event_id", "schedule_id", "group_type", "payment_deadline", "amount")
    values
      ('general_dated', 'Primer vencimiento', 'event_1', null, 'solo', '2026-07-02', 42000),
      ('general_tail', 'Último vencimiento', 'event_1', null, 'solo', null, 53000),
      ('special_all', 'Último vencimiento - ALL', 'event_1', 'schedule_all', 'solo', '2026-09-30', 44000),
      ('special_aereas', 'Acrobacias', 'event_1', 'schedule_aereas', 'grupal', null, 25000)
  `);
}

describe("the price schedules migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(
      priceSchedulesMigrationTag,
    );
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("links every special price to the schedule it named and flags it special", async () => {
    await seedPricesWithOneSchedule(db);

    await migrate(db, { migrationsFolder });

    const pricesAfter = await db.execute<{
      id: string;
      is_special_price: boolean;
    }>(sql`
      select "id", "is_special_price" from "en_escena_price" order by "id"
    `);
    const linksAfter = await db.execute<{
      price_id: string;
      schedule_id: string;
      group_type: string;
      payment_deadline: string | null;
    }>(sql`
      select "price_id", "schedule_id", "group_type", "payment_deadline"
      from "en_escena_price_schedule"
      order by "price_id"
    `);

    expect(pricesAfter.rows).toEqual([
      { id: "general_dated", is_special_price: false },
      { id: "general_tail", is_special_price: false },
      { id: "special_aereas", is_special_price: true },
      { id: "special_all", is_special_price: true },
    ]);
    expect(linksAfter.rows).toEqual([
      {
        price_id: "special_aereas",
        schedule_id: "schedule_aereas",
        group_type: "grupal",
        payment_deadline: null,
      },
      {
        price_id: "special_all",
        schedule_id: "schedule_all",
        group_type: "solo",
        payment_deadline: "2026-09-30",
      },
    ]);
  });

  it("still refuses a second deadline-less general price for a group type", async () => {
    await seedPricesWithOneSchedule(db);

    await migrate(db, { migrationsFolder });

    await expect(
      db.execute(sql`
        insert into "en_escena_price"
          ("id", "name", "event_id", "group_type", "payment_deadline", "amount")
        values ('general_tail_2', 'Otro', 'event_1', 'solo', null, 1000)
      `),
    ).rejects.toThrow();
  });

  it("refuses two special prices of one group type and deadline on the same schedule", async () => {
    await seedPricesWithOneSchedule(db);

    await migrate(db, { migrationsFolder });

    await db.execute(sql`
      insert into "en_escena_price"
        ("id", "name", "event_id", "is_special_price", "group_type", "payment_deadline", "amount")
      values ('special_aereas_2', 'Otro', 'event_1', true, 'grupal', null, 1000)
    `);
    await expect(
      db.execute(sql`
        insert into "en_escena_price_schedule"
          ("price_id", "schedule_id", "group_type", "payment_deadline")
        values ('special_aereas_2', 'schedule_aereas', 'grupal', null)
      `),
    ).rejects.toThrow();
  });
});
