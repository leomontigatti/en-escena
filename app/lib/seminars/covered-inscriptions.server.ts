import { and, eq, sql } from "drizzle-orm";

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
    (await listCoveredSeminarInscriptionIds(seminarId, executor)).length > 0
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
  const ids = await listCoveredSeminarInscriptionIds(seminarId, executor);

  return ids.filter((id) => id !== options.exceptInscriptionId).length;
}

/** The covered rows themselves, which both readings above are counted off. */
async function listCoveredSeminarInscriptionIds(
  seminarId: string,
  executor: SeminarInscriptionExecutor,
): Promise<string[]> {
  const rows = await executor
    .select({
      id: seminarInscriptions.id,
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
        eq(seminarInscriptions.seminarId, seminarId),
        activeSeminarInscription(),
      ),
    );

  return rows
    .filter((row) =>
      isSeminarInscriptionCovered({
        allocatedAmount: Number(row.allocatedAmount),
        storedDepositAmount: deriveSeminarInscriptionThresholds({
          priceAmount: row.storedPriceAmount,
          requiredDepositPercentage: row.requiredDepositPercentage,
        }).depositAmount,
        withdrawn: false,
      }),
    )
    .map((row) => row.id);
}
