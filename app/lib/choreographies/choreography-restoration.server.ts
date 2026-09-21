import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import {
  getAgeAtDate,
  getEventLocalDateParts,
} from "@/lib/choreographies/registration-resolution.server";
import { lockScheduleCapacityForAssignment } from "@/lib/choreographies/schedule-capacity-lock.server";

import { reviveWithdrawnInscriptions } from "./inscription-withdrawal.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ChoreographyRestorationFailureCode =
  "not-withdrawn" | "schedule-capacity";

export type ChoreographyRestorationResult =
  | { ok: true }
  | {
      ok: false;
      code: ChoreographyRestorationFailureCode;
      error: string;
    };

const notWithdrawnChoreographyMessage =
  "Esta coreografía no está retirada, así que no hay nada que restaurar.";

const deletedScheduleCapacityMessage =
  "No se puede restaurar: el cupo de cronograma que ocupaba ya no existe.";

/**
 * Brings a withdrawn choreography back: the stamp goes, and with it exactly the
 * inscriptions the withdrawal took — the ones carrying that same timestamp value.
 * A dancer removed individually beforehand keeps their own earlier stamp and
 * stays withdrawn, so the roster returns to what it was and not to what it once
 * was.
 *
 * The place in the schedule is asked for again, under the very lock every
 * assignment path takes, and with the choreography counting as arriving: while
 * it was withdrawn its place was free, so another choreography may have taken
 * it. That makes the restore refusable, which is the point — restoring must
 * never overshoot a capacity.
 *
 * Nothing else is re-resolved. The price is already frozen by the money the
 * choreography holds, and an evaluated presentation cannot exist on a withdrawn
 * choreography, so there is no evaluation to deal with either. The one thing
 * that is recomputed is each revived inscription's `ageAtEventStart`, which
 * `reviveWithdrawnInscriptions` writes: a revived inscription is on the roster
 * again, and no active inscription may carry an age its placement disagrees with.
 */
export async function restoreChoreography(
  choreographyId: string,
): Promise<ChoreographyRestorationResult> {
  return await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        scheduleCapacityId: choreographies.scheduleCapacityId,
        scheduleId: choreographies.scheduleId,
        withdrawnAt: choreographies.withdrawnAt,
      })
      .from(choreographies)
      .where(eq(choreographies.id, choreographyId))
      .for("update");

    if (!locked) {
      throw new Error(`Cannot restore unknown choreography ${choreographyId}.`);
    }

    if (!locked.withdrawnAt) {
      return {
        ok: false,
        code: "not-withdrawn",
        error: notWithdrawnChoreographyMessage,
      };
    }

    // A withdrawn choreography does not block deleting the capacity it points
    // at, so the reference is released when that happens (#1099) and there is
    // nowhere left to return to. Refusing here is deliberate: landing the
    // choreography on its schedule at large instead would silently move it.
    if (!locked.scheduleCapacityId) {
      return {
        ok: false,
        code: "schedule-capacity",
        error: deletedScheduleCapacityMessage,
      };
    }

    // No `excludeChoreographyId`: the choreography is arriving, not staying.
    // Being withdrawn it is not counted by the lock either way, so the count it
    // is measured against is the one it is about to join.
    const place = await lockScheduleCapacityForAssignment({
      tx,
      scheduleId: locked.scheduleId,
      scheduleCapacityId: locked.scheduleCapacityId,
    });

    if (!place.ok) {
      return { ok: false, code: "schedule-capacity", error: place.error };
    }

    await reviveWithdrawnInscriptions(
      tx,
      await findInscriptionsWithdrawnWith(tx, {
        choreographyId,
        withdrawnAt: locked.withdrawnAt,
      }),
    );

    await tx
      .update(choreographies)
      .set({ updatedAt: new Date(), withdrawnAt: null })
      .where(eq(choreographies.id, choreographyId));

    return { ok: true };
  });
}

/**
 * The inscriptions the withdrawal took, identified by carrying its very
 * timestamp: the shared value is what tells them apart from the ones withdrawn
 * individually before it. Each comes with the age it would be inscribed with
 * today, derived here because reviving puts the row back on the roster.
 */
async function findInscriptionsWithdrawnWith(
  tx: Transaction,
  input: { choreographyId: string; withdrawnAt: Date },
): Promise<Array<{ ageAtEventStart: number; id: string }>> {
  const rows = await tx
    .select({
      birthDate: dancers.birthDate,
      eventStartsAt: events.startsAt,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(
      and(
        eq(choreographyDancers.choreographyId, input.choreographyId),
        eq(choreographyDancers.withdrawnAt, input.withdrawnAt),
      ),
    );

  return rows.map((row) => ({
    ageAtEventStart: getAgeAtDate(
      row.birthDate,
      getEventLocalDateParts(row.eventStartsAt),
    ),
    id: row.id,
  }));
}
