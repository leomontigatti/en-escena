import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { isSeminarInscriptionCovered } from "@/lib/finances/seminar-inscription-thresholds.server";
import { deriveSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-price";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  hasSeminarStarted,
  type SeminarMoment,
} from "@/lib/seminars/registration-window";
import { isSeminarReservationLive } from "@/lib/seminars/seminar-reservations";

/**
 * `db` or an open transaction: every caller asks under the lock it already
 * holds on the seminar row, so the answer cannot move under the decision it
 * feeds.
 */
export type SeminarInscriptionExecutor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether any inscription of the seminar has **covered its deposit**: the sum
 * of its allocations reaches the deposit of its stored price row, on a row that
 * was not withdrawn. Covering the deposit is what takes a place in the quota,
 * and it is what freezes the seminar's `kind` and `requiredDepositPercentage`
 * (docs/domain/seminars.md, "The seminar").
 *
 * The rule itself is not restated here: the query brings back the stored row's
 * amount and the seminar's rate, and `isSeminarInscriptionCovered` decides,
 * exactly as it does for a single inscription on the read path. A seminar's
 * inscriptions are bounded by its quota, so reading them to answer costs
 * nothing and buys one rule instead of two.
 */
export async function hasCoveredSeminarInscription(
  seminarId: string,
  executor: SeminarInscriptionExecutor = db,
): Promise<boolean> {
  return (
    (
      (await listCoveredSeminarInscriptionIds([seminarId], executor)).get(
        seminarId,
      ) ?? []
    ).length > 0
  );
}

/**
 * How many places of the seminar are already taken. `exceptInscriptionId` is
 * what the allocation guard names the row it is about to fund: a row that is
 * already covered must not count against its own crossing, and a row that is not
 * cannot be double-counted by the write that crosses it.
 */
export async function countCoveredSeminarInscriptions(
  seminarId: string,
  executor: SeminarInscriptionExecutor = db,
  options: { exceptInscriptionId?: string } = {},
): Promise<number> {
  const ids =
    (await listCoveredSeminarInscriptionIds([seminarId], executor)).get(
      seminarId,
    ) ?? [];

  return ids.filter((id) => id !== options.exceptInscriptionId).length;
}

/** Who holds a seminar's places at a given moment (`readSeminarPlaces`). */
export type SeminarPlaces = {
  coveredIds: string[];
  reservedIds: string[];
};

/** The places taken, covered and reserved alike: what the quota is spent by. */
export function countTakenSeminarPlaces(places: SeminarPlaces | undefined) {
  return (places?.coveredIds.length ?? 0) + (places?.reservedIds.length ?? 0);
}

/**
 * The places reserved by rows **other** than `ownIds`: a write that covers a
 * deposit leaves the rows it crosses out, because a reservation never blocks
 * its own deposit.
 */
export function countReservedByOthers(
  places: SeminarPlaces | undefined,
  ownIds: readonly string[],
) {
  return (places?.reservedIds ?? []).filter((id) => !ownIds.includes(id))
    .length;
}

/**
 * Who holds the seminar's places at `now`: the **covered** rows, which hold one
 * for good, and the **reserved** ones, uncovered rows whose stored
 * `reservedUntil` has not passed (`isSeminarReservationLive`). The rest of the
 * active rows hold none. Every quota reading — the places left on screen, the
 * guard on a crossing, the reservation of a new row — is counted off this one
 * answer.
 */
export async function readSeminarPlaces(
  seminarIds: string[],
  now: Date,
  executor: SeminarInscriptionExecutor = db,
): Promise<Map<string, SeminarPlaces>> {
  if (seminarIds.length === 0) {
    return new Map();
  }

  const places = new Map<string, SeminarPlaces>();

  for (const row of await readActiveSeminarPlaceRows(seminarIds, executor)) {
    const seminarPlaces = places.get(row.seminarId) ?? {
      coveredIds: [],
      reservedIds: [],
    };

    if (row.covered) {
      seminarPlaces.coveredIds.push(row.id);
    } else if (
      isSeminarReservationLive(row.reservedUntil, now) &&
      // The stored end was capped at the start the seminar had at
      // registration; a seminar moved earlier ends it sooner.
      !hasSeminarStarted(row.seminar, now)
    ) {
      seminarPlaces.reservedIds.push(row.id);
    }

    places.set(row.seminarId, seminarPlaces);
  }

  return places;
}

/**
 * The covered rows themselves, grouped by seminar, which every covered count
 * above is counted off.
 */
async function listCoveredSeminarInscriptionIds(
  seminarIds: string[],
  executor: SeminarInscriptionExecutor,
): Promise<Map<string, string[]>> {
  const covered = new Map<string, string[]>();

  for (const row of await readActiveSeminarPlaceRows(seminarIds, executor)) {
    if (row.covered) {
      covered.set(row.seminarId, [
        ...(covered.get(row.seminarId) ?? []),
        row.id,
      ]);
    }
  }

  return covered;
}

type SeminarPlaceRow = {
  covered: boolean;
  id: string;
  reservedUntil: Date | null;
  seminar: SeminarMoment;
  seminarId: string;
};

/**
 * Every active row of the seminars, with whether it has covered its deposit.
 * The stored price is a left join: a row that stored none has no deposit to
 * have covered, which is the same answer the predicate gives, and it may still
 * hold a reservation.
 */
async function readActiveSeminarPlaceRows(
  seminarIds: string[],
  executor: SeminarInscriptionExecutor,
): Promise<SeminarPlaceRow[]> {
  if (seminarIds.length === 0) {
    return [];
  }

  const rows = await executor
    .select({
      id: seminarInscriptions.id,
      reservedUntil: seminarInscriptions.reservedUntil,
      seminarId: seminarInscriptions.seminarId,
      allocatedAmount: sql<number>`coalesce((
        select sum(${paymentAllocations.amount})
        from ${paymentAllocations}
        where ${paymentAllocations.seminarInscriptionId} = ${seminarInscriptions.id}
      ), 0)`,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
      startTime: seminars.startTime,
      storedPriceAmount: seminarPrices.amount,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(
      and(
        inArray(seminarInscriptions.seminarId, seminarIds),
        activeSeminarInscription(),
      ),
    );

  return rows.map((row) => ({
    covered:
      row.storedPriceAmount !== null &&
      isSeminarInscriptionCovered({
        allocatedAmount: Number(row.allocatedAmount),
        storedDepositAmount: deriveSeminarInscriptionThresholds({
          priceAmount: row.storedPriceAmount,
          requiredDepositPercentage: row.requiredDepositPercentage,
        }).depositAmount,
        withdrawn: false,
      }),
    id: row.id,
    reservedUntil: row.reservedUntil,
    seminar: { scheduledDate: row.scheduledDate, startTime: row.startTime },
    seminarId: row.seminarId,
  }));
}

/**
 * Whether **one** row's allocations reach the deposit of the row it stores,
 * withdrawn or not. The allocation path asks it before an allocation, to tell a
 * crossing of the deposit from money landing on a row already covered.
 */
export async function holdsCoveredDeposit(
  inscriptionId: string,
  executor: SeminarInscriptionExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({
      allocatedAmount: sql<number>`coalesce((
        select sum(${paymentAllocations.amount})
        from ${paymentAllocations}
        where ${paymentAllocations.seminarInscriptionId} = ${seminarInscriptions.id}
      ), 0)`,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      storedPriceAmount: seminarPrices.amount,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(eq(seminarInscriptions.id, inscriptionId));

  if (!row) {
    return false;
  }

  return isSeminarInscriptionCovered({
    allocatedAmount: Number(row.allocatedAmount),
    storedDepositAmount: deriveSeminarInscriptionThresholds({
      priceAmount: row.storedPriceAmount,
      requiredDepositPercentage: row.requiredDepositPercentage,
    }).depositAmount,
    withdrawn: false,
  });
}
