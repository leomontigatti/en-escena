/**
 * The two pieces of the seminar money path that a write over **many**
 * inscriptions, across several seminars, shares with the per-inscription money
 * dialog: the lock on the seminars and the place check.
 *
 * The per-inscription writer (`seminar-inscription-allocation.server.ts`) takes
 * the lock through here too, so one seminar or seven are
 * serialised by the same lock taken the same way.
 */

import { asc, inArray } from "drizzle-orm";

import { seminars } from "@/db/schema";
import type { SeminarFinancePriceRow } from "@/lib/finances/seminar-inscription-thresholds.server";
import { seminarPlacesShortMessage } from "@/lib/finances/seminar-cobro-refusals";
import { checkSeminarCrossings } from "@/lib/seminars/seminar-places.server";

import type {
  CobroResult,
  Transaction,
} from "./choreography-cobro-support.server";

/** A seminar as a money write reads it, under its lock. */
export type LockedSeminar = {
  eventId: string;
  id: string;
  instructorName: string;
  kind: SeminarFinancePriceRow["kind"];
  quota: number;
  requiredDepositPercentage: number;
  scheduledDate: string;
};

/**
 * The seminars' rows, taken **`FOR UPDATE`** in id order. Every money gesture on
 * a seminar inscription starts here, crossing or not: the quota is decided by
 * counting covered rows, and a count that is not taken under a lock on the
 * seminar can be invalidated by a concurrent crossing between the count and the
 * write. Two transactions racing for the last place are serialised by this lock,
 * and the loser reads the count the winner already wrote.
 *
 * The order is what lets a write span several seminars: two writes over
 * overlapping selections take their locks in the same sequence, so neither can
 * hold one the other is waiting on. It is taken before anything else is read —
 * the prices and the participant cells included — so the whole decision rests on
 * one snapshot of the seminars.
 *
 * A seminar that does not exist is simply missing from the answer; the caller
 * compares against the ids it asked for.
 */
export async function lockSeminars(
  tx: Transaction,
  seminarIds: readonly string[],
): Promise<LockedSeminar[]> {
  const ids = [...new Set(seminarIds)];

  if (ids.length === 0) {
    return [];
  }

  return await tx
    .select({
      eventId: seminars.eventId,
      id: seminars.id,
      instructorName: seminars.instructorName,
      kind: seminars.kind,
      quota: seminars.quota,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
    })
    .from(seminars)
    .where(inArray(seminars.id, ids))
    .orderBy(asc(seminars.id))
    .for("update");
}

/**
 * The place check for a write that carries several inscriptions across their
 * deposit at once, as `checkSeminarCrossings` decides it, turned into the
 * refusal the administrator reads: it names each seminar that is short and by
 * how many places. There is no partial charge and no ordering of who gets a
 * place.
 *
 * It must run under `lockSeminars` on the same seminars.
 */
export async function assertSeminarPlacesForCrossings(
  tx: Transaction,
  input: {
    crossingIdsBySeminarId: ReadonlyMap<string, readonly string[]>;
    now: Date;
    seminars: readonly LockedSeminar[];
  },
): Promise<CobroResult> {
  const check = await checkSeminarCrossings(tx, {
    crossingIdsBySeminarId: input.crossingIdsBySeminarId,
    now: input.now,
  });

  if (check.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    // In the seminars' lock order, which is the order the refusal names them.
    message: seminarPlacesShortMessage(
      input.seminars.flatMap((seminar) => {
        const shortfall = check.shortfalls.find(
          (short) => short.seminarId === seminar.id,
        );

        return shortfall
          ? [
              {
                instructorName: seminar.instructorName,
                scheduledDate: seminar.scheduledDate,
                shortBy: shortfall.shortBy,
              },
            ]
          : [];
      }),
    ),
  };
}
