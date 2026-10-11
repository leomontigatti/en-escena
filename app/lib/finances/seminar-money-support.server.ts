/**
 * The three pieces of the seminar money path that a write over **many**
 * inscriptions, across several seminars, shares with the per-inscription money
 * dialog: the lock on the seminars, the place check, and the price an
 * inscription is charged at when nobody picks one.
 *
 * The per-inscription writer (`seminar-inscription-allocation.server.ts`) takes
 * the lock and the price through here too, so one seminar or seven are
 * serialised by the same lock taken the same way.
 */

import { asc, eq, inArray } from "drizzle-orm";

import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import { selectCurrentSeminarPriceRow } from "@/lib/finances/seminar-inscription-price";
import {
  collectPersonIds,
  isParticipating,
  type SeminarFinancePriceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";
import { readEventParticipation } from "@/lib/participation/participation.server";
import { countCoveredSeminarInscriptionsBySeminar } from "@/lib/seminars/covered-inscriptions.server";
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
 * deposit at once. `neededBySeminarId` is how many of the write's inscriptions
 * cross, per seminar — none of them covered yet, so the covered count needs no
 * exception. Refuses when `covered + needed > quota` for **any** seminar, naming
 * each one that is short and by how many places; there is no partial charge and
 * no ordering of who gets a place.
 *
 * It must run under `lockSeminars` on the same seminars.
 */
export async function assertSeminarPlacesForCrossings(
  tx: Transaction,
  input: {
    neededBySeminarId: ReadonlyMap<string, number>;
    seminars: readonly LockedSeminar[];
  },
): Promise<CobroResult> {
  const crossing = input.seminars.filter(
    (seminar) => (input.neededBySeminarId.get(seminar.id) ?? 0) > 0,
  );
  const coveredBySeminarId = await countCoveredSeminarInscriptionsBySeminar(
    crossing.map((seminar) => seminar.id),
    tx,
  );
  const shortfalls = crossing
    .map((seminar) => ({
      instructorName: seminar.instructorName,
      scheduledDate: seminar.scheduledDate,
      shortBy: countSeminarPlacesShort({
        coveredCount: coveredBySeminarId.get(seminar.id) ?? 0,
        neededCount: input.neededBySeminarId.get(seminar.id) ?? 0,
        quota: seminar.quota,
      }),
    }))
    .filter((shortfall) => shortfall.shortBy > 0);

  return shortfalls.length === 0
    ? { ok: true }
    : { ok: false, message: seminarPlacesShortMessage(shortfalls) };
}

/** A seminar inscription as the price application reads it. */
export type SeminarInscriptionToPrice = {
  dancerId: string | null;
  id: string;
  professorId: string | null;
  selectedPriceId: string | null;
  seminarId: string;
};

/**
 * Stores, on every inscription that holds **no** price, the row that applies to
 * the person today (`selectCurrentSeminarPriceRow`): the seminar's kind, the
 * person's participant cell, the dated rows before the deadline-less one. An
 * inscription that already holds a price keeps it, covered or not: a price
 * somebody set on purpose is never replaced by one nobody chose.
 *
 * A cell with no row refuses the whole write rather than leaving the
 * inscription unpriced. A seminar opens only when both cells have a
 * deadline-less `regular` row, so this is a guard, not a path.
 */
export async function applyCurrentSeminarPrices(
  tx: Transaction,
  input: {
    eventId: string;
    inscriptions: readonly SeminarInscriptionToPrice[];
    seminars: readonly LockedSeminar[];
  },
): Promise<CobroResult> {
  const unpriced = input.inscriptions.filter(
    (inscription) => inscription.selectedPriceId === null,
  );

  if (unpriced.length === 0) {
    return { ok: true };
  }

  const seminarsById = new Map(
    input.seminars.map((seminar) => [seminar.id, seminar]),
  );
  const [priceRows, participation] = await Promise.all([
    tx.query.seminarPrices.findMany({
      where: eq(seminarPrices.eventId, input.eventId),
    }),
    readEventParticipation(tx, {
      dancerIds: collectPersonIds(unpriced, "dancerId"),
      eventId: input.eventId,
      professorIds: collectPersonIds(unpriced, "professorId"),
    }),
  ]);

  for (const inscription of unpriced) {
    const seminar = seminarsById.get(inscription.seminarId);
    const price = seminar
      ? selectCurrentSeminarPriceRow({
          forParticipants: isParticipating(inscription, participation),
          priceRows,
          seminarKind: seminar.kind,
        })
      : null;

    if (!price) {
      return {
        ok: false,
        message:
          "No hay un precio de seminario configurado para alguna de las inscripciones.",
      };
    }

    await tx
      .update(seminarInscriptions)
      .set({ selectedPriceId: price.id })
      .where(eq(seminarInscriptions.id, inscription.id));
  }

  return { ok: true };
}
