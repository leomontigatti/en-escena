import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";

export type ScheduleCapacityOccupancy = {
  capacity: number;
  isFull: boolean;
  occupiedCount: number;
};

export type ScheduleCapacityOccupancyTarget = {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * Counts the choreographies already assigned to each candidate capacity so the
 * view can show real occupancy and disable the full ones. It is a snapshot, not
 * a reservation: the number races with any other assignment, so
 * `lockScheduleCapacityForAssignment` remains the only guarantee. That is why no
 * lock is taken here.
 *
 * `excludeChoreographyId` mirrors the lock's exclusion: the choreography being
 * moved does not count against the capacity it already occupies, or its own
 * option would look full and disabled while the server accepts it.
 */
export async function resolveScheduleCapacityOccupancies(input: {
  excludeChoreographyId?: string;
  targets: readonly ScheduleCapacityOccupancyTarget[];
}): Promise<Map<string, ScheduleCapacityOccupancy>> {
  const occupancies = new Map<string, ScheduleCapacityOccupancy>();
  const scheduleIds = [
    ...new Set(input.targets.map((target) => target.scheduleId)),
  ];
  const scheduleCapacityIds = [
    ...new Set(
      input.targets
        .map((target) => target.scheduleCapacityId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (scheduleIds.length === 0) {
    return occupancies;
  }

  const excludedChoreographyFilter = input.excludeChoreographyId
    ? ne(choreographies.id, input.excludeChoreographyId)
    : undefined;
  const [scheduleRows, scheduleCapacityRows, scheduleCounts, capacityCounts] =
    await Promise.all([
      db
        .select({ id: schedules.id, totalCapacity: schedules.totalCapacity })
        .from(schedules)
        .where(inArray(schedules.id, scheduleIds)),
      scheduleCapacityIds.length > 0
        ? db
            .select({
              capacity: scheduleCapacities.capacity,
              id: scheduleCapacities.id,
            })
            .from(scheduleCapacities)
            .where(inArray(scheduleCapacities.id, scheduleCapacityIds))
        : [],
      countChoreographiesBySchedule({
        excludedChoreographyFilter,
        scheduleIds,
      }),
      scheduleCapacityIds.length > 0
        ? countChoreographiesByScheduleCapacity({
            excludedChoreographyFilter,
            scheduleCapacityIds,
          })
        : new Map<string, number>(),
    ]);

  const totalCapacityByScheduleId = new Map(
    scheduleRows.map((row) => [row.id, row.totalCapacity]),
  );
  const capacityByScheduleCapacityId = new Map(
    scheduleCapacityRows.map((row) => [row.id, row.capacity]),
  );

  for (const target of input.targets) {
    const scheduleTotalCapacity = totalCapacityByScheduleId.get(
      target.scheduleId,
    );

    if (scheduleTotalCapacity === undefined) {
      continue;
    }

    const scheduleOccupiedCount = scheduleCounts.get(target.scheduleId) ?? 0;
    const isScheduleFull = scheduleOccupiedCount >= scheduleTotalCapacity;

    if (target.scheduleCapacityId === null) {
      occupancies.set(toScheduleCapacityOccupancyKey(target), {
        capacity: scheduleTotalCapacity,
        isFull: isScheduleFull,
        occupiedCount: scheduleOccupiedCount,
      });
      continue;
    }

    const capacity = capacityByScheduleCapacityId.get(
      target.scheduleCapacityId,
    );

    if (capacity === undefined) {
      continue;
    }

    const occupiedCount = capacityCounts.get(target.scheduleCapacityId) ?? 0;

    occupancies.set(toScheduleCapacityOccupancyKey(target), {
      capacity,
      // The specific capacity may have room while the schedule does not: the
      // server rejects in both cases, so the option looks full in both.
      isFull: occupiedCount >= capacity || isScheduleFull,
      occupiedCount,
    });
  }

  return occupancies;
}

export function toScheduleCapacityOccupancyKey(
  target: ScheduleCapacityOccupancyTarget,
) {
  return `${target.scheduleId}:${target.scheduleCapacityId ?? ""}`;
}

/**
 * A choreography occupies the schedule whether it is assigned to it directly or
 * reached it through its capacity, exactly as in the lock's count.
 *
 * Attribution here is one-to-one: the `or` reaches the row by either of the two
 * paths, but the `group by coalesce(...)` adds it to a single schedule. The lock
 * uses the same `or` without grouping, so it adds the row to both. The two
 * counts agree only because `scheduleId` and the capacity's `scheduleId` are
 * always the same schedule — an invariant currently upheld by registration, the
 * roster path and the detail's reassignment, which write the pair together.
 * Whoever breaks that invariant breaks this counter before the lock: this one
 * would show room where the lock rejects.
 */
async function countChoreographiesBySchedule(input: {
  excludedChoreographyFilter: ReturnType<typeof ne> | undefined;
  scheduleIds: string[];
}) {
  const effectiveScheduleId = sql<string>`coalesce(${scheduleCapacities.scheduleId}, ${choreographies.scheduleId})`;
  const rows = await db
    .select({
      occupiedCount: sql<number>`count(*)`,
      scheduleId: effectiveScheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        or(
          inArray(choreographies.scheduleId, input.scheduleIds),
          inArray(scheduleCapacities.scheduleId, input.scheduleIds),
        ),
        input.excludedChoreographyFilter,
      ),
    )
    .groupBy(effectiveScheduleId);

  return new Map(
    rows.map((row) => [row.scheduleId, Number(row.occupiedCount)]),
  );
}

async function countChoreographiesByScheduleCapacity(input: {
  excludedChoreographyFilter: ReturnType<typeof ne> | undefined;
  scheduleCapacityIds: string[];
}) {
  const rows = await db
    .select({
      occupiedCount: sql<number>`count(*)`,
      scheduleCapacityId: choreographies.scheduleCapacityId,
    })
    .from(choreographies)
    .where(
      and(
        isNotNull(choreographies.scheduleCapacityId),
        inArray(choreographies.scheduleCapacityId, input.scheduleCapacityIds),
        input.excludedChoreographyFilter,
      ),
    )
    .groupBy(choreographies.scheduleCapacityId);

  return new Map(
    rows.map((row) => [
      row.scheduleCapacityId ?? "",
      Number(row.occupiedCount),
    ]),
  );
}
