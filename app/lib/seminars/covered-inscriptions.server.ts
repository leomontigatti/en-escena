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

/**
 * `db` or an open transaction: every caller asks under the lock it already
 * holds on the seminar row, so the answer cannot move under the decision it
 * feeds.
 */
export type SeminarInscriptionExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/**
 * The same count for a whole gallery of seminars, in one query. The list screen
 * reads a count per card and the per-seminar reading would make that one query
 * per card, which is the shape `countInscriptionsBySeminar` already avoids for
 * the registered count.
 */
export async function countCoveredSeminarInscriptionsBySeminar(
  seminarIds: string[],
  executor: SeminarInscriptionExecutor = db,
): Promise<Map<string, number>> {
  const coveredIds = await listCoveredSeminarInscriptionIds(
    seminarIds,
    executor,
  );

  return new Map(
    seminarIds.map((seminarId) => [
      seminarId,
      (coveredIds.get(seminarId) ?? []).length,
    ]),
  );
}

/**
 * The covered rows themselves, grouped by seminar, which every reading above is
 * counted off.
 */
async function listCoveredSeminarInscriptionIds(
  seminarIds: string[],
  executor: SeminarInscriptionExecutor,
): Promise<Map<string, string[]>> {
  if (seminarIds.length === 0) {
    return new Map();
  }

  const rows = await executor
    .select({
      id: seminarInscriptions.id,
      seminarId: seminarInscriptions.seminarId,
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
    // An inner join on the stored price: an inscription that stored none has no
    // deposit to have covered, which is the same answer the predicate gives.
    .innerJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(
      and(
        inArray(seminarInscriptions.seminarId, seminarIds),
        activeSeminarInscription(),
      ),
    );
  const covered = new Map<string, string[]>();

  for (const row of rows) {
    const isCovered = isSeminarInscriptionCovered({
      allocatedAmount: Number(row.allocatedAmount),
      storedDepositAmount: deriveSeminarInscriptionThresholds({
        priceAmount: row.storedPriceAmount,
        requiredDepositPercentage: row.requiredDepositPercentage,
      }).depositAmount,
      withdrawn: false,
    });

    if (!isCovered) {
      continue;
    }

    covered.set(row.seminarId, [...(covered.get(row.seminarId) ?? []), row.id]);
  }

  return covered;
}

/**
 * Whether **one** row's allocations reach the deposit of the row it stores,
 * withdrawn or not. It is the question revival asks about the row it is about
 * to bring back: the money a withdrawal retained is still there, so reviving it
 * can retake a place, and that has to be read before `withdrawnAt` is cleared —
 * which is exactly when the covered count cannot see it yet.
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
