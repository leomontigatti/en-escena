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

const registrationOpenMigrationTag = "0034_add_schedule_registration_open";

type Database = ReturnType<typeof drizzle>;

/**
 * Three events as production holds them the instant before the flag exists: one
 * whose registration window is running, one whose window already closed and one
 * whose window has not opened yet. Each carries a schedule, because the flag
 * lands on the schedule and the window is the only thing the backfill can read.
 */
async function seedEventsWithWindows(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_event"
      ("id", "name", "registration_starts_at", "registration_ends_at",
       "starts_at", "ends_at")
    values
      ('event_abierto', 'Certamen Abierto',
       now() - interval '10 days', now() + interval '10 days',
       now() + interval '30 days', now() + interval '32 days'),
      ('event_vencido', 'Certamen Vencido',
       now() - interval '30 days', now() - interval '10 days',
       now() + interval '30 days', now() + interval '32 days'),
      ('event_futuro', 'Certamen Futuro',
       now() + interval '10 days', now() + interval '30 days',
       now() + interval '60 days', now() + interval '62 days')
  `);
  await db.execute(sql`
    insert into "en_escena_schedule"
      ("id", "event_id", "name", "scheduled_date", "start_time",
       "total_capacity")
    values
      ('schedule_abierto', 'event_abierto', 'Función 1', '2026-10-21', '12:30', 40),
      ('schedule_abierto_dos', 'event_abierto', 'Función 2', '2026-10-21', '18:00', 40),
      ('schedule_vencido', 'event_vencido', 'Función 1', '2026-04-12', '12:30', 40),
      ('schedule_futuro', 'event_futuro', 'Función 1', '2026-12-05', '12:30', 40)
  `);
}

/**
 * The one data-touching statement of this slice: `registration_open` arrives on
 * every schedule closed, and the schedules of an event whose window contains the
 * migration instant are reopened, so that the switch starts where the window
 * left it. The DB suite replays the migrations to build its snapshot but never
 * seeds before them, so the backfill has no coverage unless a test seeds the old
 * shape and replays this migration against it.
 */
describe("the schedule registration-open migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(
      registrationOpenMigrationTag,
    );
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("opens only the schedules of an event whose window contains the migration instant", async () => {
    await seedEventsWithWindows(db);

    await migrate(db, { migrationsFolder });

    const schedulesAfter = await db.execute<{
      id: string;
      registration_open: boolean;
    }>(sql`
      select "id", "registration_open"
      from "en_escena_schedule"
      order by "id"
    `);

    expect(schedulesAfter.rows).toEqual([
      { id: "schedule_abierto", registration_open: true },
      { id: "schedule_abierto_dos", registration_open: true },
      { id: "schedule_futuro", registration_open: false },
      { id: "schedule_vencido", registration_open: false },
    ]);
  });

  it("lands the column non-nullable and closed by default", async () => {
    await seedEventsWithWindows(db);

    await migrate(db, { migrationsFolder });

    const column = await db.execute<{
      is_nullable: string;
      column_default: string | null;
    }>(sql`
      select "is_nullable", "column_default"
      from "information_schema"."columns"
      where "table_name" = 'en_escena_schedule'
        and "column_name" = 'registration_open'
    `);
    expect(column.rows).toEqual([
      { is_nullable: "NO", column_default: "false" },
    ]);

    await db.execute(sql`
      insert into "en_escena_schedule"
        ("id", "event_id", "name", "scheduled_date", "start_time",
         "total_capacity")
      values
        ('schedule_nuevo', 'event_abierto', 'Función 3', '2026-10-22', '12:30', 40)
    `);

    const inserted = await db.execute<{ registration_open: boolean }>(sql`
      select "registration_open"
      from "en_escena_schedule"
      where "id" = 'schedule_nuevo'
    `);
    expect(inserted.rows).toEqual([{ registration_open: false }]);
  });
});
