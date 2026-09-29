import { db } from "@/db";
import { priceSchedules, prices } from "@/db/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TestPriceValues = Omit<
  typeof prices.$inferInsert,
  "isSpecialPrice" | "retiredScheduleId"
> & {
  // Empty or absent for a general price; the schedules a special one covers.
  scheduleIds?: readonly string[];
};

/**
 * Inserts price rows the way the repository writes them — the special flag
 * derived from `scheduleIds` and one `price_schedule` link per schedule, with
 * the price's group type and deadline copied — for tests that seed prices
 * without going through `createPrice`. Returns the inserted rows in order.
 */
export async function insertTestPrices(
  values: readonly TestPriceValues[],
  executor: Executor = db,
) {
  const inserted: Array<typeof prices.$inferSelect> = [];

  for (const { scheduleIds = [], ...price } of values) {
    const [row] = await executor
      .insert(prices)
      .values({ ...price, isSpecialPrice: scheduleIds.length > 0 })
      .returning();

    if (scheduleIds.length > 0) {
      await executor.insert(priceSchedules).values(
        scheduleIds.map((scheduleId) => ({
          priceId: row.id,
          scheduleId,
          groupType: row.groupType,
          paymentDeadline: row.paymentDeadline,
        })),
      );
    }

    inserted.push(row);
  }

  return inserted;
}

/** `insertTestPrices` for a single row. */
export async function insertTestPrice(
  values: TestPriceValues,
  executor: Executor = db,
) {
  const [row] = await insertTestPrices([values], executor);

  return row;
}
