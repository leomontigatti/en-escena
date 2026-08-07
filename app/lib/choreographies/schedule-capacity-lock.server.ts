import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const invalidScheduleEntryMessage =
  "Elegí un cupo de cronograma compatible para confirmar la coreografía.";

export type ScheduleCapacityLockFailureCode =
  | "invalid-schedule-capacity"
  | "schedule-capacity-full";

export type ScheduleCapacityLockResult =
  | {
      ok: true;
      scheduleId: string;
      scheduleCapacityId: string | null;
    }
  | {
      ok: false;
      code: ScheduleCapacityLockFailureCode;
      error: string;
    };

/**
 * Locks the cronograma (and its cupo, when the selection targets one) and
 * counts the choreographies already assigned to it, so concurrent assignments
 * cannot overshoot the capacity. `excludeChoreographyId` keeps a choreography
 * from counting against the cupo it already occupies, which is what makes
 * re-selecting the current assignment a no-op instead of a full-capacity error.
 *
 * `scheduleCapacityId`, when given, must belong to `scheduleId`; a pair that
 * disagrees is rejected as an invalid selection.
 */
export async function lockScheduleCapacityForAssignment(input: {
  tx: Transaction;
  scheduleId: string;
  scheduleCapacityId: string | null;
  excludeChoreographyId?: string;
}): Promise<ScheduleCapacityLockResult> {
  const { tx, excludeChoreographyId } = input;
  const excludedChoreographyFilter = excludeChoreographyId
    ? ne(choreographies.id, excludeChoreographyId)
    : undefined;

  const [lockedSchedule] = await tx
    .select({
      id: schedules.id,
      totalCapacity: schedules.totalCapacity,
    })
    .from(schedules)
    .where(eq(schedules.id, input.scheduleId))
    .for("update");

  if (!lockedSchedule) {
    return failure("invalid-schedule-capacity", invalidScheduleEntryMessage);
  }

  if (input.scheduleCapacityId) {
    const [lockedScheduleCapacity] = await tx
      .select({
        id: scheduleCapacities.id,
        capacity: scheduleCapacities.capacity,
        scheduleId: scheduleCapacities.scheduleId,
      })
      .from(scheduleCapacities)
      .where(eq(scheduleCapacities.id, input.scheduleCapacityId))
      .for("update");

    if (!lockedScheduleCapacity) {
      return failure("invalid-schedule-capacity", invalidScheduleEntryMessage);
    }

    // A cupo from another cronograma would be counted against the wrong
    // cronograma's total and stored as a contradictory assignment, so the pair
    // has to belong together before anything is locked in.
    if (lockedScheduleCapacity.scheduleId !== lockedSchedule.id) {
      return failure("invalid-schedule-capacity", invalidScheduleEntryMessage);
    }

    const [specificOccupancyRow] = await tx
      .select({
        occupiedCount: sql<number>`count(*)`,
      })
      .from(choreographies)
      .where(
        and(
          eq(choreographies.scheduleCapacityId, lockedScheduleCapacity.id),
          excludedChoreographyFilter,
        ),
      );

    const specificOccupiedCount = Number(
      specificOccupancyRow?.occupiedCount ?? 0,
    );

    if (specificOccupiedCount >= lockedScheduleCapacity.capacity) {
      return failure(
        "schedule-capacity-full",
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      );
    }
  }

  const [scheduleOccupancyRow] = await tx
    .select({
      occupiedCount: sql<number>`count(*)`,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        or(
          eq(choreographies.scheduleId, lockedSchedule.id),
          eq(scheduleCapacities.scheduleId, lockedSchedule.id),
        ),
        excludedChoreographyFilter,
      ),
    );

  const scheduleOccupiedCount = Number(
    scheduleOccupancyRow?.occupiedCount ?? 0,
  );

  if (scheduleOccupiedCount >= lockedSchedule.totalCapacity) {
    return failure(
      "schedule-capacity-full",
      "El cronograma seleccionado ya no tiene cupo disponible.",
    );
  }

  return {
    ok: true,
    scheduleId: lockedSchedule.id,
    scheduleCapacityId: input.scheduleCapacityId,
  };
}

function failure(
  code: ScheduleCapacityLockFailureCode,
  error: string,
): ScheduleCapacityLockResult {
  return { ok: false, code, error };
}
