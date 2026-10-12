import { asc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, priceSchedules, prices } from "@/db/schema";
import {
  notWithdrawnChoreography,
  withdrawnChoreography,
} from "@/lib/choreographies/withdrawn-choreography";
import type { ScheduleDependencySummary } from "@/lib/schedules/schedule-dependencies";

/**
 * The schedule guards, read as reasons rather than as a yes or no, for the
 * detail page to lock and block ahead of the submit: a covering price or an
 * occupying choreography is `scheduleHasOperationalDependencies`
 * (`schedule-structure.server.ts`), and any of the three is
 * `scheduleIsReferenced` (`repository.server.ts`).
 */
export async function getScheduleDependencySummary(
  scheduleId: string,
): Promise<ScheduleDependencySummary> {
  const [coveringPrices, choreographyCounts] = await Promise.all([
    db
      .select({ name: prices.name })
      .from(priceSchedules)
      .innerJoin(prices, eq(priceSchedules.priceId, prices.id))
      .where(eq(priceSchedules.scheduleId, scheduleId))
      .orderBy(asc(prices.name)),
    db
      .select({
        occupying: countWhere(notWithdrawnChoreography()),
        withdrawn: countWhere(withdrawnChoreography()),
      })
      .from(choreographies)
      .where(eq(choreographies.scheduleId, scheduleId)),
  ]);

  return {
    coveringPriceNames: coveringPrices.map((price) => price.name),
    occupyingChoreographyCount: choreographyCounts[0]?.occupying ?? 0,
    withdrawnChoreographyCount: choreographyCounts[0]?.withdrawn ?? 0,
  };
}

function countWhere(condition: SQL) {
  return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}
