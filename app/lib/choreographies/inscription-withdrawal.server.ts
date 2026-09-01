import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  comprobanteInscriptions,
  paymentAllocations,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

/**
 * An inscription's evidence: allocated money or a comprobante line. It is the
 * justification for keeping the row, so it is also what removal from the roster
 * consults to choose between deleting and withdrawing, and what the admin
 * detail's loader uses to spell the consequence out before the admin confirms.
 */
export async function findInscriptionsWithEvidence(
  inscriptionIds: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (inscriptionIds.length === 0) {
    return new Set();
  }

  const [allocated, invoiced] = await Promise.all([
    executor
      .selectDistinct({ inscriptionId: paymentAllocations.inscriptionId })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.inscriptionId, inscriptionIds)),
    executor
      .selectDistinct({ inscriptionId: comprobanteInscriptions.inscriptionId })
      .from(comprobanteInscriptions)
      .where(
        and(
          isNotNull(comprobanteInscriptions.inscriptionId),
          inArray(comprobanteInscriptions.inscriptionId, inscriptionIds),
        ),
      ),
  ]);

  return new Set([
    ...allocated.map((row) => row.inscriptionId),
    ...invoiced.flatMap((row) =>
      row.inscriptionId ? [row.inscriptionId] : [],
    ),
  ]);
}

/**
 * Takes inscriptions off the roster, choosing once, here, between a physical
 * delete and a withdrawal: without evidence the row goes —it documents nothing,
 * and keeping it would force `choreography_dancer_unique` to be relaxed— and
 * with evidence `withdrawnAt` is marked and the row keeps the money on it.
 *
 * The choice is never revisited. Unallocating later does not touch this row: a
 * deferred delete would reintroduce the cascade just avoided and would turn
 * unallocation into a write.
 */
export async function removeInscriptionsFromRoster(
  executor: Executor,
  inscriptionIds: string[],
): Promise<void> {
  if (inscriptionIds.length === 0) {
    return;
  }

  const evidence = await findInscriptionsWithEvidence(inscriptionIds, executor);
  const withdrawnIds = inscriptionIds.filter((id) => evidence.has(id));
  const deletedIds = inscriptionIds.filter((id) => !evidence.has(id));

  if (deletedIds.length > 0) {
    await executor
      .delete(choreographyDancers)
      .where(inArray(choreographyDancers.id, deletedIds));
  }

  if (withdrawnIds.length > 0) {
    await executor
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(inArray(choreographyDancers.id, withdrawnIds));
  }
}

/**
 * Re-adding the same dancer revives their withdrawn row instead of inserting
 * another: the inscription's `id` survives, and with it the money and the
 * comprobante line that retained it. A removal corrected before the tax
 * document goes out leaves no trace.
 */
export async function reviveWithdrawnInscriptions(
  executor: Executor,
  inscriptions: Array<{ ageAtEventStart: number; id: string }>,
): Promise<void> {
  for (const inscription of inscriptions) {
    await executor
      .update(choreographyDancers)
      .set({
        ageAtEventStart: inscription.ageAtEventStart,
        withdrawnAt: null,
      })
      .where(eq(choreographyDancers.id, inscription.id));
  }
}
