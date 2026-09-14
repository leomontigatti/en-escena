import { and, eq, inArray } from "drizzle-orm";

import {
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import {
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
  type InscriptionFinancialFigures,
  type InscriptionThresholds,
} from "@/lib/finances/inscription-financial-status";
import {
  deriveSeminarInscriptionThresholds,
  resolveEffectiveSeminarPriceRow,
} from "@/lib/finances/seminar-inscription-price";
import { readEventParticipation } from "@/lib/participation/participation.server";

import type { Executor } from "./choreography-cobro-support.server";

export type SeminarFinancePriceRow = typeof seminarPrices.$inferSelect;

/**
 * The seminar inscription rows a resolution is asked about, as the caller
 * already read them. Both callers — the thresholds reader below and the
 * academy's money rollup — get here from a query of their own, so the shared
 * derivation takes the rows rather than the query that found them.
 */
export type SeminarInscriptionFinanceRow = {
  dancerId: string | null;
  id: string;
  professorId: string | null;
  requiredDepositPercentage: number;
  seminarId: string;
  seminarKind: SeminarFinancePriceRow["kind"];
  selectedPriceId: string | null;
  withdrawnAt: Date | null;
};

/**
 * A seminar inscription with its figures derived on read. `thresholds` is the
 * raw pair the write path judges by; the spread figures are what a surface
 * shows, and on a withdrawn row those two part ways exactly as they do for a
 * choreography inscription.
 */
export type ResolvedSeminarInscription = InscriptionFinancialFigures & {
  covered: boolean;
  id: string;
  priceRow: SeminarFinancePriceRow | null;
  seminarId: string;
  thresholds: InscriptionThresholds;
  withdrawn: boolean;
};

/** What the pool's threshold reader hands back for a seminar target. */
export type SeminarInscriptionThresholdResolution = InscriptionThresholds & {
  covered: boolean;
  priceRow: SeminarFinancePriceRow | null;
};

/**
 * **Covering the deposit is what takes a place in the seminar's quota**, and it
 * is what freezes the seminar's `kind` and rate and the inscription's stored
 * price row. Every one of those readings goes through this predicate, so the
 * quota, the guards and the lock trigger cannot drift apart.
 *
 * The deposit is the **stored** row's, never the row that applies today — the
 * same clause that keeps the price rule from being circular
 * (`hasCrossedDepositThreshold`) — and a withdrawn row is covered by nothing:
 * it holds its money but no place.
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

/**
 * The figures of a set of seminar inscriptions: their allocations summed, the
 * participant cell read on the roster row each one names, the effective price
 * row chosen from the event's list and the two thresholds derived from it at the
 * seminar's own rate.
 *
 * It is the single derivation behind every seminar money surface and behind the
 * write path's threshold read, which is what keeps the panel, the portal and the
 * allocation guard from quoting three prices for one inscription.
 */
export async function resolveSeminarInscriptions(
  executor: Executor,
  input: {
    eventId: string;
    rows: readonly SeminarInscriptionFinanceRow[];
  },
): Promise<Map<string, ResolvedSeminarInscription>> {
  const resolutions = new Map<string, ResolvedSeminarInscription>();

  if (input.rows.length === 0) {
    return resolutions;
  }

  const [priceRows, allocationRows, participation] = await Promise.all([
    executor.query.seminarPrices.findMany({
      where: eq(seminarPrices.eventId, input.eventId),
    }),
    executor
      .select({
        amount: paymentAllocations.amount,
        inscriptionId: paymentAllocations.seminarInscriptionId,
      })
      .from(paymentAllocations)
      .where(
        inArray(
          paymentAllocations.seminarInscriptionId,
          input.rows.map((row) => row.id),
        ),
      ),
    readEventParticipation(executor, {
      dancerIds: collectPersonIds(input.rows, "dancerId"),
      eventId: input.eventId,
      professorIds: collectPersonIds(input.rows, "professorId"),
    }),
  ]);

  const allocatedByInscription = new Map<string, number>();
  for (const allocation of allocationRows) {
    if (allocation.inscriptionId === null) {
      continue;
    }

    allocatedByInscription.set(
      allocation.inscriptionId,
      (allocatedByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
  }

  for (const row of input.rows) {
    const allocatedAmount = allocatedByInscription.get(row.id) ?? 0;
    const priceRow = resolveEffectiveSeminarPriceRow({
      allocatedAmount,
      forParticipants: isParticipating(row, participation),
      priceRows,
      requiredDepositPercentage: row.requiredDepositPercentage,
      seminarKind: row.seminarKind,
      selectedPriceId: row.selectedPriceId,
    });
    const thresholds = deriveSeminarInscriptionThresholds({
      priceAmount: priceRow?.amount ?? null,
      requiredDepositPercentage: row.requiredDepositPercentage,
    });
    const withdrawn = row.withdrawnAt !== null;

    resolutions.set(row.id, {
      ...deriveInscriptionFinancialFigures({
        allocatedAmount,
        thresholds,
        withdrawn,
      }),
      covered: isSeminarInscriptionCovered({
        allocatedAmount,
        storedDepositAmount: storedDepositAmount(row, priceRows),
        withdrawn,
      }),
      id: row.id,
      priceRow,
      seminarId: row.seminarId,
      thresholds,
      withdrawn,
    });
  }

  return resolutions;
}

/**
 * The seminar half of the pool's threshold read, in the shape the choreography
 * half already answers in. The `academyId` the pool passes is not read: a
 * seminar inscription has no `Descuento por bailarín` and no qualifying set, so
 * nothing about its figures depends on the rest of the academy's roster.
 */
export async function readSeminarInscriptionThresholds(
  executor: Executor,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
  },
): Promise<Map<string, SeminarInscriptionThresholdResolution>> {
  const thresholds = new Map<string, SeminarInscriptionThresholdResolution>();
  const inscriptionIds = [...new Set(input.inscriptionIds)];

  if (inscriptionIds.length === 0) {
    return thresholds;
  }

  const rows = await readSeminarInscriptionFinanceRows(executor, {
    eventId: input.eventId,
    where: inArray(seminarInscriptions.id, inscriptionIds),
  });
  const resolutions = await resolveSeminarInscriptions(executor, {
    eventId: input.eventId,
    rows,
  });

  for (const [inscriptionId, resolution] of resolutions) {
    thresholds.set(inscriptionId, {
      covered: resolution.covered,
      depositAmount: resolution.thresholds.depositAmount,
      priceRow: resolution.priceRow,
      totalAmount: resolution.thresholds.totalAmount,
    });
  }

  return thresholds;
}

/**
 * The inscription rows of an event, joined to the seminar that carries the kind
 * and the rate. The caller narrows with `where`; the event is always part of
 * the condition, because a price list belongs to one event and an inscription
 * of another one would be priced from the wrong list.
 */
async function readSeminarInscriptionFinanceRows(
  executor: Executor,
  input: {
    eventId: string;
    where: Parameters<typeof and>[0];
  },
): Promise<SeminarInscriptionFinanceRow[]> {
  return executor
    .select({
      dancerId: seminarInscriptions.dancerId,
      id: seminarInscriptions.id,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(and(eq(seminars.eventId, input.eventId), input.where));
}

function collectPersonIds(
  rows: readonly SeminarInscriptionFinanceRow[],
  column: "dancerId" | "professorId",
): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((personId): personId is string => personId !== null),
    ),
  ];
}

function isParticipating(
  row: SeminarInscriptionFinanceRow,
  participation: { dancerIds: Set<string>; professorIds: Set<string> },
): boolean {
  return row.dancerId !== null
    ? participation.dancerIds.has(row.dancerId)
    : row.professorId !== null &&
        participation.professorIds.has(row.professorId);
}

/** The deposit of the row the inscription **stored**, which is the one the
 * covered predicate and the lock trigger both judge by. */
function storedDepositAmount(
  row: SeminarInscriptionFinanceRow,
  priceRows: readonly SeminarFinancePriceRow[],
): number | null {
  const stored =
    row.selectedPriceId === null
      ? null
      : priceRows.find((price) => price.id === row.selectedPriceId);

  return deriveSeminarInscriptionThresholds({
    priceAmount: stored?.amount ?? null,
    requiredDepositPercentage: row.requiredDepositPercentage,
  }).depositAmount;
}
