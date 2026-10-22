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
import {
  countReservedByOthers,
  readSeminarPlaces,
} from "@/lib/seminars/covered-inscriptions.server";
import {
  countSeminarPlacesShort,
  seminarPlacesShortMessage,
} from "@/lib/seminars/seminar-places";

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
 * deposit at once. `crossingIdsBySeminarId` is which of the write's
 * inscriptions cross, per seminar — none of them covered yet, so the covered
 * count needs no exception, while their own reservations are left out of the
 * reserved count: a reservation never blocks its own deposit. Refuses when
 * `covered + reserved by others + needed > quota` for **any** seminar, naming
 * each one that is short and by how many places; there is no partial charge
 * and no ordering of who gets a place.
 *
 * It must run under `lockSeminars` on the same seminars.
 */
export async function assertSeminarPlacesForCrossings(
  tx: Transaction,
  input: {
    crossingIdsBySeminarId: ReadonlyMap<string, readonly string[]>;
    seminars: readonly LockedSeminar[];
  },
): Promise<CobroResult> {
  const crossing = input.seminars.filter(
    (seminar) =>
      (input.crossingIdsBySeminarId.get(seminar.id) ?? []).length > 0,
  );
  const placesBySeminarId = await readSeminarPlaces(
    crossing.map((seminar) => seminar.id),
    new Date(),
    tx,
  );
  const shortfalls = crossing
    .map((seminar) => {
      const crossingIds = input.crossingIdsBySeminarId.get(seminar.id) ?? [];
      const places = placesBySeminarId.get(seminar.id);

      return {
        instructorName: seminar.instructorName,
        scheduledDate: seminar.scheduledDate,
        shortBy: countSeminarPlacesShort({
          coveredCount: places?.coveredIds.length ?? 0,
          neededCount: crossingIds.length,
          quota: seminar.quota,
          reservedCount: countReservedByOthers(places, crossingIds),
        }),
      };
    })
    .filter((shortfall) => shortfall.shortBy > 0);

  return shortfalls.length === 0
    ? { ok: true }
    : { ok: false, message: seminarPlacesShortMessage(shortfalls) };
}
