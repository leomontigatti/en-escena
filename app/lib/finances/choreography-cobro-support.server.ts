import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, scheduleCapacities } from "@/db/schema";
import { loadPriceRowForUpdate, type PriceRow } from "@/lib/prices/rows.server";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything that can run a query: the connection or an open transaction. Reads
 * that participate in a cobro take this so they never open a second connection.
 */
export type Executor = Transaction | typeof db;

type FinancePriceRow = PriceRow;

/**
 * The result of a collection operation. When `ok` is `false`, `message` is text
 * ready to be shown in the administrative UI.
 */
export type CobroResult = { ok: true } | { ok: false; message: string };

/**
 * A refusal raised from inside a cobro transaction. Returning `{ ok: false }`
 * from a Drizzle transaction callback **commits**, so a write that refuses
 * halfway — the pool running dry on the third inscription — would leave the
 * earlier ones funded. Throwing rolls back; `runCobro` turns it back into the
 * `CobroResult` the caller expects.
 */
class CobroRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "CobroRefusal";
  }
}

/**
 * Runs a money change inside a transaction where **any** refusal rolls back.
 * Every one of them is all-or-nothing: an administrator who sees an error has
 * to be able to trust that nothing moved.
 */
export async function runCobro(
  run: (tx: Transaction) => Promise<CobroResult>,
): Promise<CobroResult> {
  try {
    return await db.transaction(async (tx) => {
      const result = await run(tx);

      if (!result.ok) {
        throw new CobroRefusal(result.message);
      }

      return result;
    });
  } catch (thrown) {
    if (thrown instanceof CobroRefusal) {
      return { ok: false, message: thrown.reason };
    }

    throw thrown;
  }
}

/**
 * Loads the chosen price row, validating that it belongs to the choreography's
 * candidate set: same event, same `groupType` and schedule (either a
 * schedule-specific row or a general one), without filtering by date.
 *
 * The row is read under its lock (`loadPriceRowForUpdate`), the one a price edit or
 * delete takes before its guards: an edit that commits first is validated
 * against here, and one that comes second sees the price stored.
 */
export async function loadCandidatePriceRow(
  tx: Transaction,
  input: {
    eventId: string;
    groupType: string;
    priceId: string;
    scheduleId: string;
  },
): Promise<FinancePriceRow | null> {
  const price = await loadPriceRowForUpdate(tx, input.priceId);

  if (
    !price ||
    price.eventId !== input.eventId ||
    price.groupType !== input.groupType ||
    (price.scheduleIds.length > 0 &&
      !price.scheduleIds.includes(input.scheduleId))
  ) {
    return null;
  }

  return price;
}

/**
 * The common header for loading a choreography for pricing: it brings the
 * `groupType` and the two possible sources of the schedule (the direct row or the
 * associated capacity's), plus the identity needed to validate membership. The
 * effective schedule is resolved with `resolveChoreographyPricingScheduleId`. It
 * accepts the connection or a transaction; it returns `null` if the choreography
 * does not exist.
 */
export async function loadChoreographyScheduleRow(
  executor: Transaction | typeof db,
  choreographyId: string,
) {
  const [choreographyRow] = await executor
    .select({
      academyId: choreographies.academyId,
      eventId: choreographies.eventId,
      groupType: choreographies.groupType,
      choreographyScheduleId: choreographies.scheduleId,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(eq(choreographies.id, choreographyId));

  return choreographyRow ?? null;
}
