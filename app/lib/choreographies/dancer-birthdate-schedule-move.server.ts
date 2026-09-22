import type { db } from "@/db";
import {
  guardAndLockScheduleCapacityMove,
  type ReservedSchedulePlace,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";
import type { ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";

/**
 * A transaction and not the pool: the capacity lock below takes `FOR UPDATE`,
 * which outside a transaction is released at once and guards nothing.
 */
type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What the schedule half of a birth-date correction needs to know about a
 * choreography: where it sits today, and the two axes besides the category
 * that decide which shows can take it.
 */
type CorrectedChoreographyPlacement = {
  choreographyId: string;
  eventId: string;
  groupType: ChoreographyGroupType;
  modalityId: string;
  scheduleId: string;
};

/**
 * The show a choreography moves to, already guarded and locked, so the write
 * that follows only stores what the lock granted.
 */
type GrantedScheduleMove = {
  scheduleId: string;
  scheduleCapacityId: string | null;
  scheduleName: string;
};

/**
 * Where a choreography's schedule lands once its new category is known: a
 * granted move, `null` when the schedule it sits in still accepts the category,
 * or a refusal — none, several, full or price-divergent, all of which refuse
 * the correction whole and so need no telling apart here.
 */
export type ScheduleDestination =
  { ok: true; move: GrantedScheduleMove | null } | { ok: false };

/**
 * The schedule half of the correction. The choreography stays where it is
 * whenever its current schedule is among the ones compatible with the new
 * category; otherwise exactly one compatible show, with room and without
 * repricing the money already on the inscription, is a move, and anything else
 * — none, several, full, price-divergent — refuses the correction.
 *
 * The move goes through the same guard-then-lock pair as every other capacity
 * move, taken while the destination is resolved and not while the rows are
 * written, so no choreography is rewritten before every one of them has a
 * place. Because nothing is written yet, the places the same correction already
 * granted are invisible to the lock's own count and have to be handed to it as
 * `reservedPlaces`, or two of the dancer's choreographies both claim the last
 * free place in the same show.
 */
export async function resolveDancerBirthDateScheduleDestination(input: {
  categoryId: string;
  choreography: CorrectedChoreographyPlacement;
  executor: DatabaseExecutor;
  reservedPlaces: ReservedSchedulePlace[];
}): Promise<ScheduleDestination> {
  const resolution = await resolveEventBasesScheduleOptions({
    categoryId: input.categoryId,
    eventId: input.choreography.eventId,
    executor: input.executor,
    groupType: input.choreography.groupType,
    modalityId: input.choreography.modalityId,
  });

  if (
    resolution.options.some(
      (option) => option.scheduleId === input.choreography.scheduleId,
    )
  ) {
    return { ok: true, move: null };
  }

  if (resolution.status !== "auto") {
    return { ok: false };
  }

  const destination = resolution.scheduleCapacity;
  const move = await guardAndLockScheduleCapacityMove({
    choreographyId: input.choreography.choreographyId,
    // The correction moves the schedule alone: the group type the destination
    // is priced against is the one the roster already gives the choreography.
    destinationGroupType: input.choreography.groupType,
    reservedPlaces: input.reservedPlaces,
    scheduleCapacityId: destination.scheduleCapacityId,
    scheduleId: destination.scheduleId,
    tx: input.executor,
  });

  if (!move.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    move: {
      scheduleId: move.scheduleId,
      scheduleCapacityId: move.scheduleCapacityId,
      scheduleName: destination.schedule.name,
    },
  };
}
