import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { findReservedInscriptionIds } from "@/lib/comprobantes/reservation.server";
import {
  choreographyTarget,
  restrictedChoreographyInscriptionId,
} from "@/lib/finances/allocation-target.server";
import { releaseAboveRetainedDeposit } from "@/lib/finances/withdrawal-retention.server";
import {
  choreographies,
  choreographyDancers,
  comprobanteInscriptions,
  paymentAllocations,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

/**
 * An inscription's evidence: allocated money, a comprobante line, or a line of
 * a live comprobante reservation, which may become one. It is the
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

  const [allocated, invoiced, reserved] = await Promise.all([
    executor
      .selectDistinct({ inscriptionId: restrictedChoreographyInscriptionId })
      .from(paymentAllocations)
      .where(
        inArray(paymentAllocations.choreographyInscriptionId, inscriptionIds),
      ),
    executor
      .selectDistinct({
        inscriptionId: comprobanteInscriptions.choreographyInscriptionId,
      })
      .from(comprobanteInscriptions)
      .where(
        and(
          isNotNull(comprobanteInscriptions.choreographyInscriptionId),
          inArray(
            comprobanteInscriptions.choreographyInscriptionId,
            inscriptionIds,
          ),
        ),
      ),
    findReservedInscriptionIds("choreography", inscriptionIds, executor),
  ]);

  return new Set([
    ...allocated.map((row) => row.inscriptionId),
    ...invoiced.flatMap((row) =>
      row.inscriptionId ? [row.inscriptionId] : [],
    ),
    ...reserved,
  ]);
}

/**
 * Takes inscriptions off the roster, choosing once, here, between a physical
 * delete and a withdrawal: without evidence the row goes —it documents
 * nothing— and with evidence `withdrawnAt` is marked and the row retains its
 * deposit, everything above it released to `Saldo disponible` in the same
 * transaction (#1065). A withdrawal is final: re-adding the dancer inserts a
 * new row.
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
    await releaseAboveRetainedDeposits(executor, withdrawnIds);
  }
}

/**
 * The money side of withdrawing choreography inscriptions: each one releases
 * what it holds above its deposit. Shared by roster removal and `Eliminar
 * coreografía`, which withdraws every inscription still active at once.
 */
export async function releaseAboveRetainedDeposits(
  executor: Executor,
  inscriptionIds: string[],
): Promise<void> {
  if (inscriptionIds.length === 0) {
    return;
  }

  const owners = await executor
    .select({
      academyId: choreographies.academyId,
      eventId: choreographies.eventId,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(inArray(choreographyDancers.id, inscriptionIds));

  for (const owner of owners) {
    await releaseAboveRetainedDeposit(executor, {
      academyId: owner.academyId,
      eventId: owner.eventId,
      target: choreographyTarget(owner.id),
    });
  }
}
