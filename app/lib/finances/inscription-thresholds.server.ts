import { and, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  events,
  paymentAllocations,
  scheduleCapacities,
} from "@/db/schema";
import {
  calculateDepositAmount,
  calculateTotalAmount,
  type InscriptionThresholds,
} from "@/lib/finances/inscription-financial-status";
import {
  type ChoreographyGroupType,
  computeRosterDancerDiscounts,
  type DancerDiscount,
} from "@/lib/finances/operational-summary-calculations.server";
import { loadEventPriceRows } from "@/lib/prices/rows.server";
import { resolveEffectiveBasePriceAmount } from "@/lib/finances/inscription-price";
import { restrictedChoreographyInscriptionId } from "@/lib/finances/allocation-target.server";

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
  waived: boolean;
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
    loadEventPriceRows(executor, input.eventId),
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
        waivedAt: choreographyDancers.waivedAt,
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
            inscriptionId: restrictedChoreographyInscriptionId,
          })
          .from(paymentAllocations)
          .where(
            inArray(
              paymentAllocations.choreographyInscriptionId,
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

  const discountByInscription = computeRosterDancerDiscounts({
    inscriptions: rosterRows,
    priceAmountByInscription,
  });
  const waivedInscriptionIds = new Set(
    rosterRows.filter((row) => row.waivedAt !== null).map((row) => row.id),
  );

  for (const inscriptionId of inscriptionIds) {
    thresholds.set(
      inscriptionId,
      resolveInscriptionThreshold({
        discount: discountByInscription.get(inscriptionId),
        priceAmount: priceAmountByInscription.get(inscriptionId) ?? null,
        requiredDepositPercentage: event.requiredDepositPercentage,
        waived: waivedInscriptionIds.has(inscriptionId),
      }),
    );
  }

  return thresholds;
}

/**
 * One inscription's thresholds from its effective price and live discount. A
 * waived one owes nothing whatever its price; one with no price has no
 * threshold to cross.
 */
function resolveInscriptionThreshold(input: {
  discount: DancerDiscount | undefined;
  priceAmount: number | null;
  requiredDepositPercentage: number;
  waived: boolean;
}): InscriptionThresholdResolution {
  const { priceAmount } = input;

  if (input.waived) {
    return {
      dancerDiscountAmount: 0,
      dancerDiscountPercentage: 0,
      depositAmount: 0,
      priceAmount,
      totalAmount: 0,
      waived: true,
    };
  }

  if (priceAmount === null) {
    return {
      dancerDiscountAmount: 0,
      dancerDiscountPercentage: 0,
      depositAmount: null,
      priceAmount: null,
      totalAmount: null,
      waived: false,
    };
  }

  const discount = input.discount ?? { amount: 0, percentage: 0 };

  return {
    dancerDiscountAmount: discount.amount,
    dancerDiscountPercentage: discount.percentage,
    depositAmount: calculateDepositAmount({
      priceAmount,
      requiredDepositPercentage: input.requiredDepositPercentage,
    }),
    priceAmount,
    totalAmount: calculateTotalAmount({
      dancerDiscountAmount: discount.amount,
      priceAmount,
    }),
    waived: false,
  };
}
