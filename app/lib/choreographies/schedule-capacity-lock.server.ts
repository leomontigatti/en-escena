import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import { hasPriceDivergentInscription } from "@/lib/finances/choreography-price-divergence-guard.server";
import type { ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const invalidScheduleEntryMessage =
  "Elegí un cupo de cronograma compatible para confirmar la coreografía.";

export const priceDivergenceScheduleCapacityMessage =
  "No se puede cambiar el cupo de cronograma: hay inscripciones con dinero asignado cuyo precio cambiaría.";

/**
 * Which of the two limits the assignment ran into. The forms show the lock's
 * own message either way, but restoring words its refusal itself — nothing was
 * selected there — and it has to tell the two apart without reading the text.
 */
export type ScheduleCapacityFullLimit = "schedule-capacity" | "schedule-total";

export type ScheduleCapacityLockFailure =
  | {
      ok: false;
      code: "invalid-schedule-capacity";
      error: string;
    }
  | {
      ok: false;
      code: "schedule-capacity-full";
      limit: ScheduleCapacityFullLimit;
      error: string;
    };

export type ScheduleCapacityLockResult =
  | {
      ok: true;
      scheduleId: string;
      scheduleCapacityId: string | null;
    }
  | ScheduleCapacityLockFailure;

/**
 * A place this same pass already granted but has not written yet. The lock
 * counts occupancy from the choreography rows, so a caller that resolves
 * several moves before writing any of them —the birth-date correction, which
 * has to refuse whole— must declare what it already holds, or two
 * choreographies both pass a lock over the last free place.
 */
export type ReservedSchedulePlace = {
  scheduleId: string;
  scheduleCapacityId: string | null;
};

export type ScheduleCapacityMoveResult =
  | {
      ok: true;
      scheduleId: string;
      scheduleCapacityId: string | null;
    }
  | ScheduleCapacityLockFailure
  | {
      ok: false;
      code: "price-divergence";
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
  reservedPlaces?: ReservedSchedulePlace[];
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
    reservedPlaces: input.reservedPlaces,
  });
}

/**
 * Locks the schedule (and its capacity, when the selection targets one) and
 * counts the choreographies already assigned to it, so concurrent assignments
 * cannot overshoot the capacity. `excludeChoreographyId` keeps a choreography
 * from counting against the capacity it already occupies, which is what makes
 * re-selecting the current assignment a no-op instead of a full-capacity error.
 * Withdrawn choreographies are never counted: their place is free until a
 * restore takes this same lock to claim it back.
 *
 * `scheduleCapacityId`, when given, must belong to `scheduleId`; a pair that
 * disagrees is rejected as an invalid selection.
 *
 * `reservedPlaces` are the places the same pass already granted and has not
 * written yet; they count as occupied, because the choreography rows cannot
 * speak for them.
 */
export async function lockScheduleCapacityForAssignment(input: {
  tx: Transaction;
  scheduleId: string;
  scheduleCapacityId: string | null;
  excludeChoreographyId?: string;
  reservedPlaces?: ReservedSchedulePlace[];
}): Promise<ScheduleCapacityLockResult> {
  const { tx, excludeChoreographyId } = input;
  const reservedPlaces = input.reservedPlaces ?? [];
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
          notWithdrawnChoreography(),
          excludedChoreographyFilter,
        ),
      );

    const specificOccupiedCount =
      Number(specificOccupancyRow?.occupiedCount ?? 0) +
      reservedPlaces.filter(
        (place) => place.scheduleCapacityId === lockedScheduleCapacity.id,
      ).length;

    if (specificOccupiedCount >= lockedScheduleCapacity.capacity) {
      return {
        ok: false,
        code: "schedule-capacity-full",
        limit: "schedule-capacity",
        error:
          "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      };
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
        notWithdrawnChoreography(),
        excludedChoreographyFilter,
      ),
    );

  const scheduleOccupiedCount =
    Number(scheduleOccupancyRow?.occupiedCount ?? 0) +
    reservedPlaces.filter((place) => place.scheduleId === lockedSchedule.id)
      .length;

  if (scheduleOccupiedCount >= lockedSchedule.totalCapacity) {
    return {
      ok: false,
      code: "schedule-capacity-full",
      limit: "schedule-total",
      error: "El cronograma seleccionado ya no tiene cupo disponible.",
    };
  }

  return {
    ok: true,
    scheduleId: lockedSchedule.id,
    scheduleCapacityId: input.scheduleCapacityId,
  };
}

function failure(
  code: "invalid-schedule-capacity",
  error: string,
): ScheduleCapacityLockResult {
  return { ok: false, code, error };
}
