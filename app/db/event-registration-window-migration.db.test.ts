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

const dropWindowMigrationTag = "0031_drop_event_registration_window";

type Database = ReturnType<typeof drizzle>;

/**
 * An event as production holds it the instant before the window goes, with the
 * schedule that now carries the switch: the drop must not need the columns to be
 * empty, and must not take the flag 0030 backfilled with it.
 */
async function seedEventWithWindow(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_event"
      ("id", "name", "registration_starts_at", "registration_ends_at",
       "starts_at", "ends_at")
    values
      ('event_abierto', 'Certamen Abierto',
       now() - interval '10 days', now() + interval '10 days',
       now() + interval '30 days', now() + interval '32 days')
  `);
  await db.execute(sql`
    insert into "en_escena_schedule"
      ("id", "event_id", "name", "scheduled_date", "start_time",
       "total_capacity", "registration_open")
    values
      ('schedule_abierto', 'event_abierto', 'Función 1', '2026-10-21', '12:30',
       40, true)
  `);
}

async function listEventColumns(db: Database) {
  const columns = await db.execute<{ column_name: string }>(sql`
    select "column_name"
    from "information_schema"."columns"
    where "table_name" = 'en_escena_event'
  `);

  return columns.rows.map((column) => column.column_name);
}

/**
 * The contract step of the switch: the event's two registration dates go, and
 * the `Cronograma` flag they were backfilled into stays. Nothing else in the DB
 * suite exercises it, because the suite replays the migrations against an empty
 * database and a drop on empty tables proves nothing about a populated one.
 */
describe("the event registration-window migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(dropWindowMigrationTag);
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("drops the event's two registration window columns", async () => {
    await seedEventWithWindow(db);
    expect(await listEventColumns(db)).toContain("registration_starts_at");

    await migrate(db, { migrationsFolder });

    const eventColumns = await listEventColumns(db);
    expect(eventColumns).not.toContain("registration_starts_at");
    expect(eventColumns).not.toContain("registration_ends_at");
  });

  it("leaves the schedule's inscriptions switch where the backfill put it", async () => {
    await seedEventWithWindow(db);

    await migrate(db, { migrationsFolder });

    const schedules = await db.execute<{
      id: string;
      registration_open: boolean;
    }>(sql`
      select "id", "registration_open" from "en_escena_schedule"
    `);
    expect(schedules.rows).toEqual([
      { id: "schedule_abierto", registration_open: true },
    ]);
  });
});
