import { and, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  events,
  paymentAllocations,
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
  resolveEffectiveBasePriceAmount,
} from "@/lib/finances/operational-summary-calculations.server";

import type { Executor } from "./choreography-cobro-support.server";

/**
 * An inscription's thresholds plus the inputs they were computed from. The
 * price and the discount travel alongside so a caller that has to show them
 * does not derive the same thing twice.
 */
export type InscriptionThresholdResolution = InscriptionThresholds & {
  dancerDiscountAmount: number;
  dancerDiscountPercentage: number;
  priceAmount: number | null;
};

/**
 * The two thresholds of a set of inscriptions, resolved with **the same rule as
 * the read path**: the price comes from `resolveEffectiveBasePriceAmount` — the
 * stored row once the inscription has crossed its deposit threshold, the row
 * that applies today while it has not — and the `Descuento por bailarín`
 * qualifies over the live roster. It exists so the write path can compute owed
 * without deriving a threshold of its own: both paths call
 * `calculateDepositAmount` / `calculateTotalAmount`, which remain the single
 * owner of the formula.
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
        withdrawnAt: choreographyDancers.withdrawnAt,
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

  // The effective price depends on what each row already holds, so the
  // allocations of the whole qualifying roster are summed before any price is
  // resolved — not only the requested inscriptions', because a sibling's price
  // is what decides the `Descuento por bailarín` tier.
  const allocationRows =
    rosterRows.length === 0
      ? []
      : await executor
          .select({
            amount: paymentAllocations.amount,
            inscriptionId: paymentAllocations.inscriptionId,
          })
          .from(paymentAllocations)
          .where(
            inArray(
              paymentAllocations.inscriptionId,
              rosterRows.map((row) => row.id),
            ),
          );

  const allocatedByInscription = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByInscription.set(
      allocation.inscriptionId,
      (allocatedByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
  }

  const priceAmountByInscription = new Map<string, number | null>();
  for (const row of rosterRows) {
    priceAmountByInscription.set(
      row.id,
      resolveEffectiveBasePriceAmount({
        allocatedAmount: allocatedByInscription.get(row.id) ?? 0,
        choreography: {
          choreographyScheduleId: row.choreographyScheduleId,
          groupType: row.groupType as ChoreographyGroupType,
          scheduleCapacityScheduleId: row.scheduleCapacityScheduleId,
        },
        priceRows,
        requiredDepositPercentage: event.requiredDepositPercentage,
        selectedPriceId: row.selectedPriceId,
      }),
    );
  }

  const qualifyingByDancer = new Map<
    string,
    Array<{ id: string; priceAmount: number }>
  >();
  // The withdrawn rows keep their price — the deposit figure has to stay
  // readable on them — but they leave the qualifying set: a row that is off the
  // roster cannot go on discounting its siblings. Same rule as the read path.
  for (const row of rosterRows) {
    const priceAmount = priceAmountByInscription.get(row.id);

    if (
      row.withdrawnAt !== null ||
      priceAmount === null ||
      priceAmount === undefined
    ) {
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
