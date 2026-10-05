import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events, programVisibleDays } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * Which days of an event have their program published. The program is
 * published one day at a time: automatic ordering numbers the whole event at
 * once, but a day nobody has published may still be reordered, so its numbers
 * are not final and reach neither the academies nor the public. See
 * docs/domain/judging.md, "Program And Results".
 *
 * A day is the `scheduledDate` its schedules share; there is no entity of its
 * own. A day with no row is hidden, which is what every new day starts as.
 */

/** The event's published days, in date order. */
export async function readVisibleProgramDays(
  eventId: string,
  executor: Executor = db,
): Promise<string[]> {
  const rows = await executor
    .select({ scheduledDate: programVisibleDays.scheduledDate })
    .from(programVisibleDays)
    .where(eq(programVisibleDays.eventId, eventId))
    .orderBy(asc(programVisibleDays.scheduledDate));

  return rows.map((row) => row.scheduledDate);
}

/**
 * Makes `days` the whole set of the event's published days: every other day
 * is hidden. It writes the state asked for rather than flipping one, so sending
 * the same set twice changes nothing the second time.
 */
export async function setVisibleProgramDays(
  eventId: string,
  days: readonly string[],
): Promise<void> {
  const uniqueDays = [...new Set(days)];

  await db.transaction(async (tx) => {
    // Two saves at once would each delete before either inserts, and the
    // second insert would then collide on the unique index. Taking the event
    // row first serializes them, so the later save wins whole.
    await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .for("update");

    await tx
      .delete(programVisibleDays)
      .where(eq(programVisibleDays.eventId, eventId));

    if (uniqueDays.length > 0) {
      await tx
        .insert(programVisibleDays)
        .values(
          uniqueDays.map((scheduledDate) => ({ eventId, scheduledDate })),
        );
    }
  });
}
