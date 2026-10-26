import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { hasCrossedDepositThreshold } from "@/lib/finances/inscription-financial-status";
import { deriveSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-price";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  hasSeminarStarted,
  type SeminarMoment,
} from "@/lib/seminars/registration-window";
import {
  getSeminarReservationEndsAt,
  isSeminarReservationLive,
} from "@/lib/seminars/seminar-reservations";

/**
 * The one owner of a `seminarPlace`: who holds a seminar's places at an
 * instant, and whether a write that crosses deposits fits in what is left.
 * See docs/domain/seminars.md, "The place".
 *
 * A place is held for good by a **covered** inscription and for a while by a
 * **reserved** one, and by nothing else; a withdrawn inscription holds none.
 * Every reading takes the instant it is read at: a reservation ends by time
 * alone, with nothing written, so a reading without one would answer for
 * whenever the code happened to run.
 *
 * The module answers with figures and refusal codes. The copy a user reads is
 * the surface's.
 */

/** `db` or an open transaction. A guard reads under the seminar lock its
 * caller holds, so the answer cannot move under the write it decides. */
export type SeminarPlaceExecutor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeminarPlaceHolding = "covered" | "reserved" | "none";

export type SeminarPlaceLedger = {
  seminarId: string;
  quota: number;
  /** The holding of an active row; a withdrawn or unknown row is `undefined`. */
  holdingOf(inscriptionId: string): SeminarPlaceHolding | undefined;
  coveredCount: number;
  reservedCount: number;
  /** The quota less the covered and the reserved rows, never below zero. */
  availablePlaces: number;
  /** No place is left: what `Cupo completo` says. */
  isFull: boolean;
  /**
   * The places free for these rows to cross their deposit. The rows are left
   * out of both counts: a reservation never blocks its own deposit, and a row
   * already covered never counts against its own crossing.
   */
  placesLeftFor(crossingIds: readonly string[]): number;
  /** How many of these crossings do not fit; zero means the write fits. */
  shortfallFor(crossingIds: readonly string[]): number;
};

/**
 * **Covering the deposit is what takes a place**, and it is what freezes the
 * seminar's `kind` and rate and the inscription's stored price row. The
 * deposit is the **stored** row's, never the row that applies today — the same
 * clause that keeps the price rule from being circular — and a withdrawn row is
 * covered by nothing: it holds its money but no place.
 *
 * The database trigger that freezes the stored row
 * (`en_escena_guard_seminar_inscription_selected_price`) restates the same
 * threshold in SQL.
 */
export function isSeminarInscriptionCovered(input: {
  allocatedAmount: number;
  storedDepositAmount: number | null;
  withdrawn: boolean;
}): boolean {
  if (input.withdrawn) {
    return false;
  }

  return hasCrossedDepositThreshold({
    allocatedAmount: input.allocatedAmount,
    depositAmount: input.storedDepositAmount,
  });
}

/** What one inscription holds in money against the deposit of its stored row. */
export type SeminarRowCoverage = {
  allocatedAmount: number;
  covered: boolean;
  seminarId: string;
  /** Null while the row stores no price, which is a row that can cover nothing. */
  storedDepositAmount: number | null;
  withdrawn: boolean;
};

/** Every row the ids name, withdrawn ones included and flagged. */
export async function readSeminarRowsCoverage(
  executor: SeminarPlaceExecutor,
  inscriptionIds: readonly string[],
): Promise<Map<string, SeminarRowCoverage>> {
  const rows =
    inscriptionIds.length === 0
      ? []
      : await readCoverageRows(
          executor,
          inArray(seminarInscriptions.id, [...new Set(inscriptionIds)]),
        );

  return new Map(rows.map((row) => [row.id, row]));
}

/** Whether taking `releasedAmount` off a row drops it below the deposit it
 * covered, which is the place it loses. A withdrawn row has none to lose. */
export function losesSeminarPlace(input: {
  coverage: SeminarRowCoverage;
  releasedAmount: number;
}): boolean {
  return (
    input.coverage.covered &&
    !isSeminarInscriptionCovered({
      allocatedAmount: input.coverage.allocatedAmount - input.releasedAmount,
      storedDepositAmount: input.coverage.storedDepositAmount,
      withdrawn: input.coverage.withdrawn,
    })
  );
}

/**
 * The ledger of each seminar at `now`. A seminar with no active row still has
 * one, with its whole quota free; an id that names no seminar has none.
 */
export async function readSeminarPlaceLedgers(
  executor: SeminarPlaceExecutor,
  input: { now: Date; seminarIds: readonly string[] },
): Promise<Map<string, SeminarPlaceLedger>> {
  const read = await readLedgers(executor, input);

  return new Map(
    [...read].map(([seminarId, { ledger }]) => [seminarId, ledger]),
  );
}

export type SeminarCrossingCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "no-places";
      shortfalls: { seminarId: string; shortBy: number }[];
    };

/**
 * The quota's one guard: whether these rows can cross their deposits, per
 * seminar, all or nothing. It runs under the lock the money write takes on the
 * seminars before anything else is read (`lockSeminars`), so two crossings for
 * the last place serialise and the second reads the first.
 *
 * Whether a row crosses is the money write's to know, since it depends on how
 * the write prices it; this guard is only told which rows do.
 */
export async function checkSeminarCrossings(
  tx: Transaction,
  input: {
    crossingIdsBySeminarId: ReadonlyMap<string, readonly string[]>;
    now: Date;
  },
): Promise<SeminarCrossingCheck> {
  const crossing = [...input.crossingIdsBySeminarId].filter(
    ([, ids]) => ids.length > 0,
  );
  const ledgers = await readSeminarPlaceLedgers(tx, {
    now: input.now,
    seminarIds: crossing.map(([seminarId]) => seminarId),
  });
  const shortfalls = crossing
    .map(([seminarId, ids]) => ({
      seminarId,
      shortBy: ledgers.get(seminarId)?.shortfallFor(ids) ?? ids.length,
    }))
    .filter((shortfall) => shortfall.shortBy > 0);

  return shortfalls.length === 0
    ? { ok: true }
    : { ok: false, reason: "no-places", shortfalls };
}

/**
 * The reservation a registration made at `now` is given: until
 * `getSeminarReservationEndsAt` when a place is free, and none in a full
 * seminar, which never gains one later. It runs under the registration's lock
 * on the seminar, so two registrations cannot both take the last place.
 */
export async function grantSeminarReservation(
  tx: Transaction,
  input: { now: Date; seminarId: string },
): Promise<Date | null> {
  const read = (
    await readLedgers(tx, { now: input.now, seminarIds: [input.seminarId] })
  ).get(input.seminarId);

  if (!read || read.ledger.isFull) {
    return null;
  }

  return getSeminarReservationEndsAt(read.moment, input.now);
}

/**
 * Whether the seminar may describe `quota` places. Its floor is the covered
 * count: that is what gave places away for good, while an uncovered row holds
 * no place and does not hold the floor up. Raising the quota is always free.
 * It runs under the seminar's lock, the one a crossing takes.
 */
export async function checkSeminarQuota(
  tx: Transaction,
  input: { quota: number; seminarId: string },
): Promise<
  { ok: true } | { ok: false; reason: "below-covered"; floor: number }
> {
  const floor = (await readActiveCoverageRows(tx, [input.seminarId])).filter(
    (row) => row.covered,
  ).length;

  return input.quota < floor
    ? { ok: false, reason: "below-covered", floor }
    : { ok: true };
}

/**
 * Whether any active inscription of the seminar has covered its deposit, which
 * is what freezes the seminar's `kind` and deposit rate.
 */
export async function hasCoveredSeminarInscription(
  executor: SeminarPlaceExecutor,
  seminarId: string,
): Promise<boolean> {
  return (await readActiveCoverageRows(executor, [seminarId])).some(
    (row) => row.covered,
  );
}

type LedgerRead = { ledger: SeminarPlaceLedger; moment: SeminarMoment };

async function readLedgers(
  executor: SeminarPlaceExecutor,
  input: { now: Date; seminarIds: readonly string[] },
): Promise<Map<string, LedgerRead>> {
  const ids = [...new Set(input.seminarIds)];

  if (ids.length === 0) {
    return new Map();
  }

  const [seminarRows, rows] = await Promise.all([
    executor
      .select({
        id: seminars.id,
        quota: seminars.quota,
        scheduledDate: seminars.scheduledDate,
        startTime: seminars.startTime,
      })
      .from(seminars)
      .where(inArray(seminars.id, ids)),
    readActiveCoverageRows(executor, ids),
  ]);

  return new Map(
    seminarRows.map((seminar) => {
      const moment = {
        scheduledDate: seminar.scheduledDate,
        startTime: seminar.startTime,
      };
      // The stored end was capped at the start the seminar had at
      // registration; a seminar moved earlier ends it sooner.
      const started = hasSeminarStarted(moment, input.now);
      const holdings = new Map<string, SeminarPlaceHolding>(
        rows
          .filter((row) => row.seminarId === seminar.id)
          .map((row) => [row.id, holdingOf(row, { now: input.now, started })]),
      );

      return [seminar.id, { ledger: buildLedger(seminar, holdings), moment }];
    }),
  );
}

function holdingOf(
  row: CoverageRow,
  input: { now: Date; started: boolean },
): SeminarPlaceHolding {
  if (row.covered) {
    return "covered";
  }

  return !input.started &&
    isSeminarReservationLive(row.reservedUntil, input.now)
    ? "reserved"
    : "none";
}

function buildLedger(
  seminar: { id: string; quota: number },
  holdings: ReadonlyMap<string, SeminarPlaceHolding>,
): SeminarPlaceLedger {
  const countHeld = (holding: SeminarPlaceHolding, except: readonly string[]) =>
    [...holdings].filter(
      ([id, held]) => held === holding && !except.includes(id),
    ).length;
  const placesLeftFor = (crossingIds: readonly string[]) =>
    Math.max(
      0,
      seminar.quota -
        countHeld("covered", crossingIds) -
        countHeld("reserved", crossingIds),
    );
  const availablePlaces = placesLeftFor([]);

  return {
    availablePlaces,
    coveredCount: countHeld("covered", []),
    holdingOf: (inscriptionId) => holdings.get(inscriptionId),
    isFull: availablePlaces === 0,
    placesLeftFor,
    quota: seminar.quota,
    reservedCount: countHeld("reserved", []),
    seminarId: seminar.id,
    shortfallFor: (crossingIds) =>
      Math.max(0, crossingIds.length - placesLeftFor(crossingIds)),
  };
}

type CoverageRow = SeminarRowCoverage & {
  id: string;
  reservedUntil: Date | null;
};

function readActiveCoverageRows(
  executor: SeminarPlaceExecutor,
  seminarIds: readonly string[],
): Promise<CoverageRow[]> {
  return readCoverageRows(
    executor,
    and(
      inArray(seminarInscriptions.seminarId, [...seminarIds]),
      activeSeminarInscription(),
    ),
  );
}

/**
 * The one query every covered reading goes through: each row with the sum of
 * its allocations and the deposit of the row it **stored**, at its seminar's
 * own rate. The stored price is a left join: a row that stored none has no
 * deposit to have covered, and it may still hold a reservation.
 */
async function readCoverageRows(
  executor: SeminarPlaceExecutor,
  where: SQL | undefined,
): Promise<CoverageRow[]> {
  const rows = await executor
    .select({
      allocatedAmount: sql<number>`coalesce((
        select sum(${paymentAllocations.amount})
        from ${paymentAllocations}
        where ${paymentAllocations.seminarInscriptionId} = ${seminarInscriptions.id}
      ), 0)`,
      id: seminarInscriptions.id,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      reservedUntil: seminarInscriptions.reservedUntil,
      seminarId: seminarInscriptions.seminarId,
      storedPriceAmount: seminarPrices.amount,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(where);

  return rows.map((row) => {
    const allocatedAmount = Number(row.allocatedAmount);
    const storedDepositAmount = deriveSeminarInscriptionThresholds({
      priceAmount: row.storedPriceAmount,
      requiredDepositPercentage: row.requiredDepositPercentage,
    }).depositAmount;
    const withdrawn = row.withdrawnAt !== null;

    return {
      allocatedAmount,
      covered: isSeminarInscriptionCovered({
        allocatedAmount,
        storedDepositAmount,
        withdrawn,
      }),
      id: row.id,
      reservedUntil: row.reservedUntil,
      seminarId: row.seminarId,
      storedDepositAmount,
      withdrawn,
    };
  });
}
