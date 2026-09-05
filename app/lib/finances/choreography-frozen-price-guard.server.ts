import { eq, sql } from "drizzle-orm";

import {
  choreographyDancers,
  events,
  paymentAllocations,
  prices,
} from "@/db/schema";
import {
  calculateDepositAmount,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import {
  type ChoreographyGroupType,
  resolveEffectiveBasePriceRow,
} from "@/lib/finances/operational-summary-calculations.server";

import {
  type Executor,
  loadChoreographyScheduleRow,
} from "./choreography-cobro-support.server";
import { resolveChoreographyPricingScheduleId } from "./choreography-pricing-schedule";

/**
 * Where a move would leave the choreography on the price key: the pricing
 * schedule **and** the group type. Modality is not part of the key — it only
 * decides which schedules accept the choreography — but the group type is, and
 * the roster path moves it without moving any schedule at all.
 */
export type DestinationPriceKey = {
  groupType: ChoreographyGroupType;
  scheduleId: string | null;
};

/**
 * Would the move change what any money-holding inscription is charged?
 *
 * The question is amount equality **evaluated today**, per inscription with
 * money on it: resolve the effective base price against the current price key
 * and against the destination one, and diverge only when the two amounts
 * differ. Amount equality is enough on its own — the `Descuento por bailarín`
 * tiers are computed off sibling *amounts*, so a move that preserves every
 * amount preserves every discount too.
 *
 * That is narrower than asking whether money exists at all, and deliberately
 * so: an inscription at or above its deposit threshold is charged its **stored**
 * row whatever schedule the choreography sits on, so moving it provably cannot
 * touch a peso. Below the threshold the price is live by design, and there a
 * move genuinely can reprice — which is what this refuses.
 *
 * Two edges the amount comparison alone would get wrong:
 *
 * - An unresolvable price on both sides (`null → null`) **passes**: nothing
 *   changes. Any `null ↔ number` transition diverges, in either direction.
 * - A frozen inscription whose stored row is pinned to a schedule diverges when
 *   the destination's pricing schedule differs, even though both sides resolve
 *   to that same stored amount. The freeze promises the stored row is never
 *   rewritten, and `readInscriptionPriceOptions` only offers rows of the
 *   choreography's own schedule, so carrying the pinned row over would leave the
 *   inscription on a price the allocation dialog can no longer name.
 */
export async function hasPriceDivergentInscription(input: {
  choreographyId: string;
  destination: DestinationPriceKey;
  executor: Executor;
}): Promise<boolean> {
  const diverges = await loadPriceDivergenceCheck({
    choreographyId: input.choreographyId,
    executor: input.executor,
  });

  return diverges(input.destination);
}

/**
 * Answers the same question as `hasPriceDivergentInscription` for **many**
 * destinations off a single read.
 *
 * The option resolver asks it once per alternative schedule, and the money of a
 * choreography does not change between two of those answers: loading the
 * inscriptions, the event and the event's price rows once and closing over them
 * keeps the filter to one round trip instead of one per option, and — because
 * both go through the same closure — keeps the offered options and the guard
 * answering with the same rule.
 */
export async function loadPriceDivergenceCheck(input: {
  choreographyId: string;
  executor: Executor;
}): Promise<(destination: DestinationPriceKey) => boolean> {
  const { executor } = input;
  const choreography = await loadChoreographyScheduleRow(
    executor,
    input.choreographyId,
  );

  if (!choreography) {
    return () => false;
  }

  const moneyRows = await executor
    .select({
      allocatedAmount: sql<number>`sum(${paymentAllocations.amount})`,
      inscriptionId: choreographyDancers.id,
      selectedPriceId: choreographyDancers.selectedPriceId,
    })
    .from(choreographyDancers)
    .innerJoin(
      paymentAllocations,
      eq(paymentAllocations.inscriptionId, choreographyDancers.id),
    )
    .where(eq(choreographyDancers.choreographyId, input.choreographyId))
    .groupBy(choreographyDancers.id);

  const inscriptions = moneyRows
    .map((row) => ({
      allocatedAmount: Number(row.allocatedAmount ?? 0),
      selectedPriceId: row.selectedPriceId,
    }))
    .filter((inscription) => inscription.allocatedAmount > 0);

  if (inscriptions.length === 0) {
    return () => false;
  }

  const [event, priceRows] = await Promise.all([
    executor.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, choreography.eventId),
    }),
    executor.query.prices.findMany({
      where: eq(prices.eventId, choreography.eventId),
    }),
  ]);

  if (!event) {
    return () => false;
  }

  const currentKey = {
    choreographyScheduleId: choreography.choreographyScheduleId,
    groupType: choreography.groupType as ChoreographyGroupType,
    scheduleCapacityScheduleId: choreography.scheduleCapacityScheduleId,
  };

  return (destination: DestinationPriceKey) => {
    // The destination arrives already resolved to a single schedule, so it is
    // fed in through the choreography's own source and leaves the capacity's
    // empty; `resolveChoreographyPricingScheduleId` reads the pair the same way.
    const destinationKey = {
      choreographyScheduleId: destination.scheduleId,
      groupType: destination.groupType,
      scheduleCapacityScheduleId: null,
    };
    const destinationScheduleId =
      resolveChoreographyPricingScheduleId(destinationKey);

    return inscriptions.some(({ allocatedAmount, selectedPriceId }) => {
      const resolveAgainst = (choreographyKey: typeof currentKey) =>
        resolveEffectiveBasePriceRow({
          allocatedAmount,
          choreography: choreographyKey,
          priceRows,
          requiredDepositPercentage: event.requiredDepositPercentage,
          selectedPriceId,
        });

      if (
        isSchedulePinnedFrozenRow({
          allocatedAmount,
          destinationScheduleId,
          priceRows,
          requiredDepositPercentage: event.requiredDepositPercentage,
          selectedPriceId,
        })
      ) {
        return true;
      }

      const before = resolveAgainst(currentKey)?.amount ?? null;
      const after = resolveAgainst(destinationKey)?.amount ?? null;

      return before !== after;
    });
  };
}

/**
 * Whether the inscription is frozen against a row that belongs to a schedule
 * other than the destination's. Read off the **stored** row and its own
 * threshold, the same pair `resolveEffectiveBasePriceRow` freezes on.
 */
function isSchedulePinnedFrozenRow(input: {
  allocatedAmount: number;
  destinationScheduleId: string | null;
  priceRows: Array<typeof prices.$inferSelect>;
  requiredDepositPercentage: number;
  selectedPriceId: string | null;
}): boolean {
  const stored =
    input.selectedPriceId === null
      ? null
      : (input.priceRows.find((price) => price.id === input.selectedPriceId) ??
        null);

  if (stored === null || stored.scheduleId === null) {
    return false;
  }

  const frozen = hasCrossedDepositThreshold({
    allocatedAmount: input.allocatedAmount,
    depositAmount: calculateDepositAmount({
      priceAmount: stored.amount,
      requiredDepositPercentage: input.requiredDepositPercentage,
    }),
  });

  return frozen && stored.scheduleId !== input.destinationScheduleId;
}

/**
 * The alternatives a price filter leaves standing, and the ids it took away.
 *
 * Both surfaces that offer a schedule capacity — the standalone reassignment
 * and the modality correction — split their compatible set exactly this way, so
 * they split it here: the two lists have to be complements of one another for
 * the intent to re-derive its refusal reason from the omitted half, and one
 * pass keyed on `id` is also what keeps them from disagreeing.
 *
 * `assignedOptionId` is never filtered, whatever the price says: staying put
 * reprices nothing, and dropping the assignment would leave the select with no
 * account of where the choreography sits today.
 */
export function partitionPriceDivergentOptions<
  TOption extends { id: string; scheduleId: string },
>(input: {
  assignedOptionId: string | null;
  diverges: (destination: DestinationPriceKey) => boolean;
  groupType: ChoreographyGroupType;
  options: TOption[];
}): { divergentIds: string[]; selectable: TOption[] } {
  const divergentIds: string[] = [];
  const selectable: TOption[] = [];

  for (const option of input.options) {
    const isDivergent =
      option.id !== input.assignedOptionId &&
      input.diverges({
        groupType: input.groupType,
        scheduleId: option.scheduleId,
      });

    if (isDivergent) {
      divergentIds.push(option.id);
    } else {
      selectable.push(option);
    }
  }

  return { divergentIds, selectable };
}
