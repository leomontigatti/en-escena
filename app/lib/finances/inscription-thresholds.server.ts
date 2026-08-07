import { and, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import {
  calculateDepositAmount,
  calculateTotalAmount,
  type InscriptionThresholds,
} from "@/lib/finances/inscription-financial-status";
import {
  type ChoreographyGroupType,
  computeDancerDiscountAmounts,
  type DancerDiscount,
  resolveEstimatedBasePriceAmount,
} from "@/lib/finances/operational-summary-calculations.server";

import type { Executor } from "./choreography-cobro-support.server";

type RosterRow = {
  id: string;
  dancerId: string;
  selectedPriceId: string | null;
  groupType: string;
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * An inscription's thresholds plus the inputs they were computed from. The
 * price and the discount travel alongside because the cobro still persists them
 * in the frozen columns, and taking them from a second count would derive the
 * same thing twice.
 */
export type InscriptionThresholdResolution = InscriptionThresholds & {
  dancerDiscountAmount: number;
  dancerDiscountPercentage: number;
  priceAmount: number | null;
};

/**
 * The two thresholds of a set of inscriptions, resolved with **the same rule as
 * the read path**: the price rules (the selected row, and failing that the one
 * applicable to the schedule) and the `Descuento por bailarín` qualifies over
 * the live roster. It exists so the write path can compute owed without
 * deriving a threshold of its own: both paths call `calculateDepositAmount` /
 * `calculateTotalAmount`, which remain the single owner of the formula.
 *
 * An inscription with no resolvable price comes out with both thresholds
 * `null`, which is what the read path shows as incomplete and what the write
 * path refuses.
 */
export async function readInscriptionThresholds(
  executor: Executor,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
  },
): Promise<Map<string, InscriptionThresholdResolution>> {
  const thresholds = new Map<string, InscriptionThresholdResolution>();
  const inscriptionIds = [...new Set(input.inscriptionIds)];

  if (inscriptionIds.length === 0) {
    return thresholds;
  }

  const event = await executor.query.events.findFirst({
    columns: { requiredDepositPercentage: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    return thresholds;
  }

  const targets = await executor
    .select({ dancerId: choreographyDancers.dancerId })
    .from(choreographyDancers)
    .where(inArray(choreographyDancers.id, inscriptionIds));
  const dancerIds = [...new Set(targets.map((row) => row.dancerId))];

  if (dancerIds.length === 0) {
    return thresholds;
  }

  const [priceRows, rosterRows] = await Promise.all([
    executor.query.prices.findMany({
      where: eq(prices.eventId, input.eventId),
    }),
    // The dancer's live roster within the event and academy: it is the set
    // that decides how many inscriptions qualify for the discount, which is why
    // the requested inscriptions alone are not enough.
    executor
      .select({
        id: choreographyDancers.id,
        dancerId: choreographyDancers.dancerId,
        selectedPriceId: choreographyDancers.selectedPriceId,
        groupType: choreographies.groupType,
        choreographyScheduleId: choreographies.scheduleId,
        scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographyDancers)
      .innerJoin(
        choreographies,
        eq(choreographyDancers.choreographyId, choreographies.id),
      )
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(
        and(
          eq(choreographies.academyId, input.academyId),
          eq(choreographies.eventId, input.eventId),
          inArray(choreographyDancers.dancerId, dancerIds),
        ),
      ),
  ]);

  const priceAmountByInscription = new Map<string, number | null>();
  for (const row of rosterRows) {
    priceAmountByInscription.set(
      row.id,
      resolveRosterPriceAmount({ priceRows, row }),
    );
  }

  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; priceAmount: number }>
  >();
  for (const row of rosterRows) {
    const priceAmount = priceAmountByInscription.get(row.id);

    if (priceAmount === null || priceAmount === undefined) {
      continue;
    }

    const bucket = qualifyingByDancer.get(row.dancerId);
    const entry = { id: row.id, priceAmount };

    if (bucket) {
      bucket.push(entry);
    } else {
      qualifyingByDancer.set(row.dancerId, [entry]);
    }
  }

  const discountByInscription = new Map<string, DancerDiscount>();
  for (const group of qualifyingByDancer.values()) {
    for (const [id, discount] of computeDancerDiscountAmounts(group)) {
      discountByInscription.set(id, discount);
    }
  }

  for (const inscriptionId of inscriptionIds) {
    const priceAmount = priceAmountByInscription.get(inscriptionId) ?? null;
    const discount = discountByInscription.get(inscriptionId) ?? {
      amount: 0,
      percentage: 0,
    };

    if (priceAmount === null) {
      thresholds.set(inscriptionId, {
        dancerDiscountAmount: 0,
        dancerDiscountPercentage: 0,
        depositAmount: null,
        priceAmount: null,
        totalAmount: null,
      });
      continue;
    }

    thresholds.set(inscriptionId, {
      dancerDiscountAmount: discount.amount,
      dancerDiscountPercentage: discount.percentage,
      depositAmount: calculateDepositAmount({
        priceAmount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
      priceAmount,
      totalAmount: calculateTotalAmount({
        dancerDiscountAmount: discount.amount,
        priceAmount,
      }),
    });
  }

  return thresholds;
}

/**
 * An inscription's price: the selected row when it has one, otherwise the one
 * applicable to its group type and schedule. Same order as the read path.
 */
function resolveRosterPriceAmount(input: {
  priceRows: (typeof prices.$inferSelect)[];
  row: RosterRow;
}): number | null {
  if (input.row.selectedPriceId !== null) {
    const selected = input.priceRows.find(
      (price) => price.id === input.row.selectedPriceId,
    );

    if (selected) {
      return selected.amount;
    }
  }

  const estimated = resolveEstimatedBasePriceAmount({
    choreography: {
      choreographyScheduleId: input.row.choreographyScheduleId,
      groupType: input.row.groupType as ChoreographyGroupType,
      scheduleCapacityScheduleId: input.row.scheduleCapacityScheduleId,
    },
    priceRows: input.priceRows,
  });

  return estimated.status === "missing-price" ? null : estimated.amount;
}
