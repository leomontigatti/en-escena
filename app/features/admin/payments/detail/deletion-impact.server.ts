/**
 * What deleting a payment does, computed before it is done.
 *
 * Deletion **always succeeds** — money is fungible and the allocations fall by
 * the foreign key's cascade — so this is not a guard. It is what the dialog
 * says: every choreography the payment reaches, the amount it takes out of it,
 * and how many of its inscriptions drop back below a threshold they had
 * crossed.
 *
 * Two things the reading has to be honest about:
 *
 * - The money **leaves the pool**. `Saldo disponible` is
 *   `Σ payments − Σ allocations`, and deleting the payment removes both terms
 *   at once, so nothing comes back as available balance.
 * - The resulting status is named **only when a threshold actually crosses**.
 *   With nothing un-crossing there is no new state to announce, and naming the
 *   unchanged one would read as a consequence of the deletion.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialStatus,
  hasUncrossedThreshold,
  type ChoreographyFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

export type PaymentDeletionImpact = {
  /** What this payment has allocated to the choreography, and takes with it. */
  allocatedAmount: number;
  id: string;
  name: string;
  /** Named only when at least one inscription un-crosses. */
  resultingStatus: ChoreographyFinancialStatus | null;
  uncrossingInscriptionCount: number;
};

export async function readPaymentDeletionImpact(input: {
  academyId: string;
  eventId: string;
  paymentId: string;
}): Promise<PaymentDeletionImpact[]> {
  const affected = await db
    .select({
      amount: paymentAllocations.amount,
      choreographyId: choreographyDancers.choreographyId,
      choreographyName: choreographies.name,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .innerJoin(
      choreographyDancers,
      eq(paymentAllocations.inscriptionId, choreographyDancers.id),
    )
    .innerJoin(
      choreographies,
      eq(choreographyDancers.choreographyId, choreographies.id),
    )
    .where(eq(paymentAllocations.paymentId, input.paymentId));

  if (affected.length === 0) {
    return [];
  }

  const choreographyIds = [
    ...new Set(affected.map((row) => row.choreographyId)),
  ];

  // The rollup is read over the **active** inscriptions of every reached
  // choreography, not only the ones this payment funds: a sibling that keeps
  // its money still holds the minimum down.
  const activeInscriptions = await db
    .select({
      choreographyId: choreographyDancers.choreographyId,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .where(
      and(
        inArray(choreographyDancers.choreographyId, choreographyIds),
        activeInscription(),
      ),
    );

  const inscriptionIds = [
    ...new Set(activeInscriptions.map((inscription) => inscription.id)),
  ];
  const [allocatedByInscription, thresholds] = await Promise.all([
    readAllocatedByInscription(inscriptionIds),
    readInscriptionThresholds(db, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds,
    }),
  ]);

  const releasedByInscription = new Map<string, number>();
  const releasedByChoreography = new Map<string, number>();
  for (const row of affected) {
    releasedByInscription.set(
      row.inscriptionId,
      (releasedByInscription.get(row.inscriptionId) ?? 0) + row.amount,
    );
    releasedByChoreography.set(
      row.choreographyId,
      (releasedByChoreography.get(row.choreographyId) ?? 0) + row.amount,
    );
  }

  const nameByChoreography = new Map(
    affected.map((row) => [row.choreographyId, row.choreographyName]),
  );

  return choreographyIds
    .map((choreographyId) => ({
      ...readChoreographyImpact({
        allocatedByInscription,
        inscriptions: activeInscriptions.filter(
          (inscription) => inscription.choreographyId === choreographyId,
        ),
        releasedByInscription,
        thresholds,
      }),
      allocatedAmount: releasedByChoreography.get(choreographyId) ?? 0,
      id: choreographyId,
      name: nameByChoreography.get(choreographyId) ?? "",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

/**
 * The status each inscription lands on once this payment's money is gone, and
 * how many of them fell. A withdrawn inscription is not here: it keeps its
 * money and its evidence, but it is out of the choreography's status rollup.
 */
function readChoreographyImpact(input: {
  allocatedByInscription: Map<string, number>;
  inscriptions: Array<{ id: string }>;
  releasedByInscription: Map<string, number>;
  thresholds: Awaited<ReturnType<typeof readInscriptionThresholds>>;
}): Pick<
  PaymentDeletionImpact,
  "resultingStatus" | "uncrossingInscriptionCount"
> {
  let uncrossingInscriptionCount = 0;
  const statusesAfter = input.inscriptions.map((inscription) => {
    const resolved = input.thresholds.get(inscription.id) ?? {
      depositAmount: null,
      totalAmount: null,
    };
    const allocatedAmount =
      input.allocatedByInscription.get(inscription.id) ?? 0;
    const before = deriveInscriptionFinancialStatus({
      allocatedAmount,
      depositAmount: resolved.depositAmount,
      totalAmount: resolved.totalAmount,
    });
    const after = deriveInscriptionFinancialStatus({
      allocatedAmount:
        allocatedAmount -
        (input.releasedByInscription.get(inscription.id) ?? 0),
      depositAmount: resolved.depositAmount,
      totalAmount: resolved.totalAmount,
    });

    if (hasUncrossedThreshold({ after, before })) {
      uncrossingInscriptionCount += 1;
    }

    return after;
  });

  return {
    resultingStatus:
      uncrossingInscriptionCount > 0
        ? deriveChoreographyFinancialStatus(statusesAfter)
        : null,
    uncrossingInscriptionCount,
  };
}

async function readAllocatedByInscription(
  inscriptionIds: string[],
): Promise<Map<string, number>> {
  const allocatedByInscription = new Map<string, number>();

  if (inscriptionIds.length === 0) {
    return allocatedByInscription;
  }

  const rows = await db
    .select({
      amount: paymentAllocations.amount,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  for (const row of rows) {
    allocatedByInscription.set(
      row.inscriptionId,
      (allocatedByInscription.get(row.inscriptionId) ?? 0) + row.amount,
    );
  }

  return allocatedByInscription;
}
