import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";
import { hasFrozenPriceInscription } from "@/lib/finances/choreography-frozen-price-guard.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const invalidScheduleEntryMessage =
  "Elegí un cupo de cronograma compatible para confirmar la coreografía.";

export const frozenPriceScheduleCapacityMessage =
  "No se puede cambiar el cupo de cronograma: hay inscripciones con dinero asignado.";

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

export type ScheduleCapacityMoveFailureCode =
  | ScheduleCapacityLockFailureCode
  | "frozen-price";

export type ScheduleCapacityMoveResult =
  | {
      ok: true;
      scheduleId: string;
      scheduleCapacityId: string | null;
    }
  | {
      ok: false;
      code: ScheduleCapacityMoveFailureCode;
      error: string;
    };

/**
 * The guard-then-lock pair every capacity move must run, whatever entry point
 * triggers it (the standalone reassignment, the roster path). Kept as one
 * function so the two callers can't drift on order or on which move counts as
 * frozen: re-checking the guard outside a transaction, or after the lock,
 * would leave a window where a concurrent allocation lands unnoticed.
 */
export async function guardAndLockScheduleCapacityMove(input: {
  tx: Transaction;
  choreographyId: string;
  scheduleId: string;
  scheduleCapacityId: string | null;
}): Promise<ScheduleCapacityMoveResult> {
  if (await hasFrozenPriceInscription(input.choreographyId, input.tx)) {
    return {
      ok: false,
      code: "frozen-price",
      error: frozenPriceScheduleCapacityMessage,
    };
  }

  return lockScheduleCapacityForAssignment({
    tx: input.tx,
    scheduleId: input.scheduleId,
    scheduleCapacityId: input.scheduleCapacityId,
    excludeChoreographyId: input.choreographyId,
  });
}

/**
 * Locks the schedule (and its capacity, when the selection targets one) and
 * counts the choreographies already assigned to it, so concurrent assignments
 * cannot overshoot the capacity. `excludeChoreographyId` keeps a choreography
 * from counting against the capacity it already occupies, which is what makes
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

    // A capacity from another schedule would be counted against the wrong
    // schedule's total and stored as a contradictory assignment, so the pair
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
