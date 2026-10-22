import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { seminarPrices } from "@/db/schema";

// A transaction in practice: the lock is released at once outside one.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Takes every seminar price row of the event `FOR SHARE`, in id order, before
 * a money write reads them to store one on an inscription. Editing a price
 * takes its row `FOR UPDATE` before its guards ask whether an inscription
 * stored it (`updateSeminarPrice`, `deleteSeminarPrice`), so whichever comes
 * second sees what the first committed: the edit finds the price stored and
 * refuses, the write charges by the edited row or finds it gone.
 *
 * Shared rather than exclusive because the writers only read the rows: two
 * charges in the same event do not wait on each other here. It is taken after
 * the seminar locks (and a preset's inscription locks) and before the pool
 * lock, and the editor holds no other lock, so it adds no order to deadlock
 * against.
 */
export async function lockEventSeminarPrices(
  executor: Executor,
  eventId: string,
) {
  await executor
    .select({ id: seminarPrices.id })
    .from(seminarPrices)
    .where(eq(seminarPrices.eventId, eventId))
    .orderBy(asc(seminarPrices.id))
    .for("share");
}
