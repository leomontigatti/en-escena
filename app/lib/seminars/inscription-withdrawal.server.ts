/**
 * The seminar twin of `app/lib/choreographies/inscription-withdrawal.server.ts`,
 * and the one place that decides whether taking an inscription off a seminar's
 * roster deletes the row or withdraws it. Both sides go through it — the
 * academy's removal from the portal and administration's from the seminar
 * detail — so the two cannot drift into two rules.
 *
 * It is a second module rather than a branch inside the choreography one for the
 * same reason the predicate is a second predicate: what differs is the table,
 * and a chooser that took one would be the same knowledge with an extra
 * argument.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  comprobanteInscriptions,
  paymentAllocations,
  seminarInscriptions,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

/**
 * A seminar inscription's evidence: allocated money or a comprobante line. It
 * is the justification for keeping the row, so it is both what the chooser
 * consults and what the two removal dialogs read to say the consequence out
 * loud before the removal is confirmed.
 */
export async function findSeminarInscriptionsWithEvidence(
  inscriptionIds: string[],
  executor: Executor = db,
): Promise<Set<string>> {
  if (inscriptionIds.length === 0) {
    return new Set();
  }

  const [allocated, invoiced] = await Promise.all([
    executor
      .selectDistinct({
        inscriptionId: paymentAllocations.seminarInscriptionId,
      })
      .from(paymentAllocations)
      .where(inArray(paymentAllocations.seminarInscriptionId, inscriptionIds)),
    executor
      .selectDistinct({
        inscriptionId: comprobanteInscriptions.seminarInscriptionId,
      })
      .from(comprobanteInscriptions)
      .where(
        and(
          isNotNull(comprobanteInscriptions.seminarInscriptionId),
          inArray(comprobanteInscriptions.seminarInscriptionId, inscriptionIds),
        ),
      ),
  ]);

  return new Set(
    [...allocated, ...invoiced].flatMap((row) =>
      row.inscriptionId ? [row.inscriptionId] : [],
    ),
  );
}

/**
 * Takes one inscription off the seminar's roster, choosing here and only here:
 * without evidence the row goes — it documents nothing, and keeping it would
 * force the two partial unique indexes to be relaxed — and with evidence
 * `withdrawnAt` is stamped and everything else is left alone, money, stored
 * price row and `createdAt` included.
 *
 * The choice is never revisited: de-allocating a withdrawn row later does not
 * delete it, exactly as on the choreography side.
 */
export async function removeSeminarInscriptionFromRoster(
  executor: Executor,
  inscriptionId: string,
): Promise<{ withdrawn: boolean }> {
  const evidence = await findSeminarInscriptionsWithEvidence(
    [inscriptionId],
    executor,
  );

  if (!evidence.has(inscriptionId)) {
    await executor
      .delete(seminarInscriptions)
      .where(eq(seminarInscriptions.id, inscriptionId));

    return { withdrawn: false };
  }

  await executor
    .update(seminarInscriptions)
    .set({ withdrawnAt: new Date() })
    .where(eq(seminarInscriptions.id, inscriptionId));

  return { withdrawn: true };
}

/**
 * Registering the same person again revives their withdrawn row instead of
 * inserting another: the inscription's `id` survives, and with it the money, the
 * stored price row and the `createdAt` that dates the inscription. A removal
 * corrected before the money moved leaves no trace.
 */
export async function reviveWithdrawnSeminarInscription(
  executor: Executor,
  inscriptionId: string,
): Promise<void> {
  await executor
    .update(seminarInscriptions)
    .set({ withdrawnAt: null })
    .where(eq(seminarInscriptions.id, inscriptionId));
}
