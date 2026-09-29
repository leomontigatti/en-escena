import { asc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { priceSchedules, prices } from "@/db/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * A choreography `price` row with the schedules it covers: empty on a general
 * row, one or more on a special one. The retired `schedule_id` column is left
 * out, so nothing can read the tier off it by mistake.
 */
export type PriceRow = Omit<typeof prices.$inferSelect, "retiredScheduleId"> & {
  scheduleIds: string[];
};

/**
 * The price rows `where` selects, each with its `scheduleIds`. Every reader of
 * choreography prices loads them here, so the tier a row belongs to is read the
 * same way everywhere.
 */
export async function loadPriceRows(
  executor: Executor,
  where: SQL | undefined,
): Promise<PriceRow[]> {
  const rows = await executor.select().from(prices).where(where);

  if (rows.length === 0) {
    return [];
  }

  const links = await executor
    .select({
      priceId: priceSchedules.priceId,
      scheduleId: priceSchedules.scheduleId,
    })
    .from(priceSchedules)
    .where(
      inArray(
        priceSchedules.priceId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(priceSchedules.scheduleId));
  const scheduleIdsByPriceId = new Map<string, string[]>();

  for (const link of links) {
    const scheduleIds = scheduleIdsByPriceId.get(link.priceId) ?? [];

    scheduleIds.push(link.scheduleId);
    scheduleIdsByPriceId.set(link.priceId, scheduleIds);
  }

  return rows.map(({ retiredScheduleId: _retired, ...row }) => ({
    ...row,
    scheduleIds: scheduleIdsByPriceId.get(row.id) ?? [],
  }));
}

/** `loadPriceRows` for every price of an event. */
export function loadEventPriceRows(executor: Executor, eventId: string) {
  return loadPriceRows(executor, eq(prices.eventId, eventId));
}

/** `loadPriceRows` for one price, `null` when it does not exist. */
export async function loadPriceRow(executor: Executor, priceId: string) {
  const [row] = await loadPriceRows(executor, eq(prices.id, priceId));

  return row ?? null;
}
