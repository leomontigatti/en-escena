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

const awardCeremonyMigrationTag = "0042_add_schedule_award_ceremony";

type Database = ReturnType<typeof drizzle>;

/**
 * An event with one schedule, as production holds them the instant before the
 * ceremony columns exist.
 */
async function seedScheduleBeforeCeremony(db: Database) {
  await db.execute(sql`set session_replication_role = replica`);
  await db.execute(sql`
    insert into "en_escena_event" ("id", "name", "starts_at", "ends_at")
    values ('event_activo', 'Certamen', now() + interval '30 days',
            now() + interval '32 days')
  `);
  await db.execute(sql`
    insert into "en_escena_schedule"
      ("id", "event_id", "name", "scheduled_date", "start_time",
       "total_capacity")
    values
      ('schedule_existente', 'event_activo', 'Función 1', '2026-12-01', '10:00', 40)
  `);
}

async function insertSchedule(
  db: Database,
  id: string,
  ceremony: { date: string | null; time: string | null },
) {
  await db.execute(sql`
    insert into "en_escena_schedule"
      ("id", "event_id", "name", "scheduled_date", "start_time",
       "total_capacity", "award_ceremony_date", "award_ceremony_time")
    values
      (${id}, 'event_activo', 'Función', '2026-12-01', '18:00', 40,
       ${ceremony.date}, ${ceremony.time})
  `);
}

/**
 * The award ceremony lands as two nullable columns and one check: an existing
 * schedule keeps no ceremony, a new one takes both halves or neither, and a
 * half-set pair is refused by the database whatever the form lets through.
 */
describe("the schedule award ceremony migration", () => {
  let pglite: PGlite;
  let db: Database;
  let folderBefore: string;

  beforeEach(async () => {
    folderBefore = await createMigrationsFolderBefore(
      awardCeremonyMigrationTag,
    );
    pglite = new PGlite();
    db = drizzle(pglite);
    await migrate(db, { migrationsFolder: folderBefore });
    await seedScheduleBeforeCeremony(db);
    await migrate(db, { migrationsFolder });
  });

  afterEach(async () => {
    await pglite.close();
    await rm(folderBefore, { force: true, recursive: true });
  });

  it("leaves an existing schedule without a ceremony", async () => {
    const existing = await db.execute<{
      award_ceremony_date: string | null;
      award_ceremony_time: string | null;
    }>(sql`
      select "award_ceremony_date", "award_ceremony_time"
      from "en_escena_schedule"
      where "id" = 'schedule_existente'
    `);

    expect(existing.rows).toEqual([
      { award_ceremony_date: null, award_ceremony_time: null },
    ]);
  });

  it("stores a schedule with a ceremony and one without", async () => {
    await insertSchedule(db, "schedule_con_entrega", {
      date: "2026-12-02",
      time: "00:15",
    });
    await insertSchedule(db, "schedule_sin_entrega", {
      date: null,
      time: null,
    });

    const stored = await db.execute<{
      id: string;
      award_ceremony_date: string | null;
      award_ceremony_time: string | null;
    }>(sql`
      select "id", "award_ceremony_date", "award_ceremony_time"
      from "en_escena_schedule"
      where "id" in ('schedule_con_entrega', 'schedule_sin_entrega')
      order by "id"
    `);

    expect(stored.rows).toEqual([
      {
        id: "schedule_con_entrega",
        award_ceremony_date: "2026-12-02",
        award_ceremony_time: "00:15",
      },
      {
        id: "schedule_sin_entrega",
        award_ceremony_date: null,
        award_ceremony_time: null,
      },
    ]);
  });

  it.each([
    { label: "a date without a time", date: "2026-12-01", time: null },
    { label: "a time without a date", date: null, time: "22:30" },
  ])("refuses $label", async ({ date, time }) => {
    // Drizzle wraps the driver's error; the constraint is named on its cause.
    await expect(
      insertSchedule(db, "schedule_a_medias", { date, time }),
    ).rejects.toMatchObject({
      cause: { constraint: "schedule_award_ceremony_both_or_neither" },
    });
  });
});
