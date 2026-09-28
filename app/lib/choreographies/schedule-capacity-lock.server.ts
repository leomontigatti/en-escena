import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  scheduleCategories,
  scheduleModalities,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
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

/**
 * Which of the choreography's modality and category the locked schedule does
 * not accept. The forms refuse either one with the same message, as they do
 * when the selection was never compatible; restoring words the two apart.
 */
export type ScheduleIncompatibility = "modality" | "category";

/**
 * What the choreography being placed needs the schedule to accept. `null`
 * category asks about the modality alone.
 */
export type ScheduleAcceptanceQuery = {
  modalityId: string;
  categoryId: string | null;
};

export type ScheduleIncompatibleFailure = {
  ok: false;
  code: "invalid-schedule-capacity";
  incompatibility: ScheduleIncompatibility;
  error: string;
};

export type ScheduleCapacityLockFailure =
  | {
      ok: false;
      code: "invalid-schedule-capacity";
      error: string;
    }
  | ScheduleIncompatibleFailure
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
  accepts?: ScheduleAcceptanceQuery;
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
    accepts: input.accepts,
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
 *
 * `accepts`, when given, is checked against the schedule's accepted modalities
 * and categories once the row is locked. A schedule edit locks the same row
 * before narrowing them, so the answer holds until this transaction commits;
 * the compatible options a caller resolved before the lock are only a
 * snapshot. A caller leaves it out only where compatibility is not the
 * question: a choreography staying on the slot it already occupies.
 */
export async function lockScheduleCapacityForAssignment(input: {
  tx: Transaction;
  scheduleId: string;
  scheduleCapacityId: string | null;
  excludeChoreographyId?: string;
  reservedPlaces?: ReservedSchedulePlace[];
  accepts?: ScheduleAcceptanceQuery;
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

  const incompatible = input.accepts
    ? await checkScheduleAcceptance(tx, lockedSchedule.id, input.accepts)
    : null;

  if (incompatible) {
    return incompatible;
  }

  if (input.scheduleCapacityId) {
    const capacityFailure = await lockSpecificScheduleCapacity({
      tx,
      scheduleId: lockedSchedule.id,
      scheduleCapacityId: input.scheduleCapacityId,
      excludedChoreographyFilter,
      reservedPlaces,
    });

    if (capacityFailure) {
      return capacityFailure;
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

/**
 * Locks the capacity the selection targets and refuses it when it belongs to
 * another schedule or has no place left; `null` when it can take one more.
 */
async function lockSpecificScheduleCapacity(input: {
  tx: Transaction;
  scheduleId: string;
  scheduleCapacityId: string;
  excludedChoreographyFilter: ReturnType<typeof ne> | undefined;
  reservedPlaces: ReservedSchedulePlace[];
}): Promise<ScheduleCapacityLockFailure | null> {
  const [lockedScheduleCapacity] = await input.tx
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
  if (lockedScheduleCapacity.scheduleId !== input.scheduleId) {
    return failure("invalid-schedule-capacity", invalidScheduleEntryMessage);
  }

  const [specificOccupancyRow] = await input.tx
    .select({
      occupiedCount: sql<number>`count(*)`,
    })
    .from(choreographies)
    .where(
      and(
        eq(choreographies.scheduleCapacityId, lockedScheduleCapacity.id),
        notWithdrawnChoreography(),
        input.excludedChoreographyFilter,
      ),
    );

  const specificOccupiedCount =
    Number(specificOccupancyRow?.occupiedCount ?? 0) +
    input.reservedPlaces.filter(
      (place) => place.scheduleCapacityId === lockedScheduleCapacity.id,
    ).length;

  if (specificOccupiedCount >= lockedScheduleCapacity.capacity) {
    return {
      ok: false,
      code: "schedule-capacity-full",
      limit: "schedule-capacity",
      error: "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
    };
  }

  return null;
}

/**
 * Locks the schedule row and checks that it accepts the choreography, with no
 * place counted. For the writes that change a choreography's category while it
 * stays on its schedule and slot: nothing about occupancy moves, but the
 * category still has to be one the schedule accepts when the write commits.
 */
export async function lockScheduleAcceptance(input: {
  tx: Transaction;
  scheduleId: string;
  accepts: ScheduleAcceptanceQuery;
}): Promise<{ ok: true } | ScheduleCapacityLockFailure> {
  const [lockedSchedule] = await input.tx
    .select({ id: schedules.id })
    .from(schedules)
    .where(eq(schedules.id, input.scheduleId))
    .for("update");

  if (!lockedSchedule) {
    return failure("invalid-schedule-capacity", invalidScheduleEntryMessage);
  }

  return (
    (await checkScheduleAcceptance(
      input.tx,
      lockedSchedule.id,
      input.accepts,
    )) ?? { ok: true }
  );
}

async function checkScheduleAcceptance(
  tx: Transaction,
  scheduleId: string,
  accepts: ScheduleAcceptanceQuery,
): Promise<ScheduleIncompatibleFailure | null> {
  const incompatibility = await findScheduleIncompatibility(tx, {
    scheduleId,
    ...accepts,
  });

  return incompatibility ? toIncompatibleFailure(incompatibility) : null;
}

/**
 * Which of the choreography's modality and category its schedule does not
 * accept, modality first. A schedule with no accepted-category row accepts
 * every category.
 */
async function findScheduleIncompatibility(
  tx: Transaction,
  choreography: ScheduleAcceptanceQuery & { scheduleId: string },
): Promise<ScheduleIncompatibility | null> {
  const acceptedModalities = await tx
    .select({ modalityId: scheduleModalities.modalityId })
    .from(scheduleModalities)
    .where(eq(scheduleModalities.scheduleId, choreography.scheduleId));

  if (
    !acceptedModalities.some(
      (accepted) => accepted.modalityId === choreography.modalityId,
    )
  ) {
    return "modality";
  }

  if (choreography.categoryId === null) {
    return null;
  }

  const acceptedCategories = await tx
    .select({ categoryId: scheduleCategories.categoryId })
    .from(scheduleCategories)
    .where(eq(scheduleCategories.scheduleId, choreography.scheduleId));

  if (
    acceptedCategories.length > 0 &&
    !acceptedCategories.some(
      (accepted) => accepted.categoryId === choreography.categoryId,
    )
  ) {
    return "category";
  }

  return null;
}

function toIncompatibleFailure(
  incompatibility: ScheduleIncompatibility,
): ScheduleIncompatibleFailure {
  return {
    ok: false,
    code: "invalid-schedule-capacity",
    incompatibility,
    error: invalidScheduleEntryMessage,
  };
}

function failure(
  code: "invalid-schedule-capacity",
  error: string,
): ScheduleCapacityLockFailure {
  return { ok: false, code, error };
}
