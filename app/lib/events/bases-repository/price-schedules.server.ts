import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  priceSchedules,
  prices,
  scheduleCapacities,
  schedules,
} from "@/db/schema";
import type {
  EventBasesExecutor,
  EventBasesTransaction,
} from "@/lib/events/bases-repository/shared.server";
import type { PriceRow } from "@/lib/prices/rows.server";

/**
 * Rewrites the schedules a price covers, and with them the copies of its group
 * type and deadline that `price_schedule_tier_unique` reads. Every save goes
 * through here, so the copies never lag the price.
 */
export async function replacePriceSchedules(
  tx: EventBasesTransaction,
  price: Pick<
    typeof prices.$inferSelect,
    "id" | "groupType" | "paymentDeadline"
  >,
  scheduleIds: readonly string[],
) {
  await tx.delete(priceSchedules).where(eq(priceSchedules.priceId, price.id));

  if (scheduleIds.length === 0) {
    return;
  }

  await tx.insert(priceSchedules).values(
    scheduleIds.map((scheduleId) => ({
      priceId: price.id,
      scheduleId,
      groupType: price.groupType,
      paymentDeadline: price.paymentDeadline,
    })),
  );
}

/**
 * The names of the schedules an edit drops from a price while an inscription
 * that stored the price sits on them: the schedules the edit cannot remove.
 * Below its deposit such an inscription re-derives its price from what its
 * schedule is offered, so dropping the schedule would reprice it. A withdrawn
 * inscription counts too, because its price still resolves.
 */
export async function listOccupiedDroppedSchedules(
  executor: EventBasesExecutor,
  existing: Pick<PriceRow, "id" | "scheduleIds">,
  scheduleIds: readonly string[],
) {
  const dropped = existing.scheduleIds.filter(
    (scheduleId) => !scheduleIds.includes(scheduleId),
  );

  if (dropped.length === 0) {
    return [];
  }

  // The same rule `resolveChoreographyPricingScheduleId` applies: the
  // capacity's schedule first, the choreography's own otherwise.
  const pricingScheduleId = sql<string>`coalesce(${scheduleCapacities.scheduleId}, ${choreographies.scheduleId})`;
  const occupied = await executor
    .selectDistinct({
      name: schedules.name,
      scheduledDate: schedules.scheduledDate,
      startTime: schedules.startTime,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .leftJoin(
      scheduleCapacities,
      eq(scheduleCapacities.id, choreographies.scheduleCapacityId),
    )
    .innerJoin(schedules, eq(schedules.id, pricingScheduleId))
    .where(
      and(
        eq(choreographyDancers.selectedPriceId, existing.id),
        inArray(pricingScheduleId, dropped),
      ),
    )
    .orderBy(asc(schedules.scheduledDate), asc(schedules.startTime));

  return occupied.map((schedule) => schedule.name);
}

/** Whether some special price covers the schedule, which then cannot go. */
export async function isScheduleCoveredByPrice(
  executor: EventBasesExecutor,
  scheduleId: string,
) {
  const [link] = await executor
    .select({ priceId: priceSchedules.priceId })
    .from(priceSchedules)
    .where(eq(priceSchedules.scheduleId, scheduleId))
    .limit(1);

  return Boolean(link);
}
