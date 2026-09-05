import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";
import { hasPriceDivergentInscription } from "@/lib/finances/choreography-price-divergence-guard.server";
import type { ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const invalidScheduleEntryMessage =
  "Elegí un cupo de cronograma compatible para confirmar la coreografía.";

export const priceDivergenceScheduleCapacityMessage =
  "No se puede cambiar el cupo de cronograma: hay inscripciones con dinero asignado cuyo precio cambiaría.";

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
  | "price-divergence";

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
 * triggers it (the standalone reassignment, the modality correction, the roster
 * path). Kept as one function so the three callers can't drift on order or on
 * which move counts as blocked: re-checking the guard outside a transaction, or
 * after the lock, would leave a window where a concurrent allocation lands
 * unnoticed.
 *
 * The money question is asked against the **destination price key**, so every
 * caller has to name where the move lands on both of its axes.
 * `destinationGroupType` is the choreography's own for the two schedule-moving
 * entry points, and the post-edit one for the roster path, where a solo turning
 * into a duo moves the price key with no schedule moving at all.
 */
export async function guardAndLockScheduleCapacityMove(input: {
  tx: Transaction;
  choreographyId: string;
  destinationGroupType: ChoreographyGroupType;
  scheduleId: string;
  scheduleCapacityId: string | null;
}): Promise<ScheduleCapacityMoveResult> {
  const diverges = await hasPriceDivergentInscription({
    choreographyId: input.choreographyId,
    destination: {
      groupType: input.destinationGroupType,
      // The schedule the capacity belongs to is validated against this one by
      // the lock below, so the pair cannot price the move against one schedule
      // and store it against another.
      scheduleId: input.scheduleId,
    },
    executor: input.tx,
  });

  if (diverges) {
    return {
      ok: false,
      code: "price-divergence",
      error: priceDivergenceScheduleCapacityMessage,
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
