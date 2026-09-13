/**
 * What deleting a payment does, computed before it is done.
 *
 * Deletion **always succeeds** — money is fungible and the allocations fall by
 * the foreign key's cascade — so this is not a guard. It is what the dialog
 * says: every unit the payment reaches — choreographies and seminars in **one
 * list** — the amount it takes out of it, and what its inscriptions lose. A
 * choreography names the threshold they drop back below; a seminar names the
 * **places** they lose, because on that side covering the deposit is what took
 * the place (docs/domain/seminars.md, "The place").
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

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { restrictedChoreographyInscriptionId } from "@/lib/finances/allocation-target.server";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  deriveMinimumFinancialStatus,
  deriveInscriptionFinancialStatus,
  hasUncrossedThreshold,
  type ChoreographyFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";
import { deriveSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-price";
import { isSeminarInscriptionCovered } from "@/lib/finances/seminar-inscription-thresholds.server";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";

/** What this payment has allocated to one unit, and takes with it. */
type PaymentDeletionImpactBase = {
  allocatedAmount: number;
  id: string;
  name: string;
};

type SeminarUnitImpact = Extract<PaymentDeletionImpact, { kind: "seminar" }>;

export type PaymentDeletionImpact =
  | (PaymentDeletionImpactBase & {
      kind: "choreography";
      /** Named only when at least one inscription un-crosses. */
      resultingStatus: ChoreographyFinancialStatus | null;
      uncrossingInscriptionCount: number;
    })
  | (PaymentDeletionImpactBase & {
      kind: "seminar";
      /** How many of the seminar's inscriptions drop below the deposit of their
       * stored price row, and so lose the place they had taken. */
      losingPlaceCount: number;
    });

export async function readPaymentDeletionImpact(input: {
  academyId: string;
  eventId: string;
  paymentId: string;
}): Promise<PaymentDeletionImpact[]> {
  const [choreographyImpacts, seminarImpacts] = await Promise.all([
    readChoreographyImpacts(input),
    readSeminarImpacts(input.paymentId),
  ]);

  return [...choreographyImpacts, ...seminarImpacts].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );
}

/**
 * The seminar half of the list. Only the inscriptions this payment funds can
 * lose a place, so those are the rows read, each with what it holds in total and
 * the deposit of the row it **stored** — the same threshold the crossing was
 * judged by. A withdrawn row holds money but no place, so it is out.
 */
async function readSeminarImpacts(
  paymentId: string,
): Promise<PaymentDeletionImpact[]> {
  const affected = await db
    .select({
      allocatedAmount: sql<number>`coalesce((
        select sum(${paymentAllocations.amount})
        from ${paymentAllocations}
        where ${paymentAllocations.seminarInscriptionId} = ${seminarInscriptions.id}
      ), 0)`,
      instructorName: seminars.instructorName,
      releasedAmount: paymentAllocations.amount,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      seminarId: seminars.id,
      storedPriceAmount: seminarPrices.amount,
    })
    .from(paymentAllocations)
    .innerJoin(
      seminarInscriptions,
      eq(paymentAllocations.seminarInscriptionId, seminarInscriptions.id),
    )
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(
      and(
        eq(paymentAllocations.paymentId, paymentId),
        activeSeminarInscription(),
      ),
    );

  const impacts = new Map<string, SeminarUnitImpact>();

  for (const row of affected) {
    const storedDepositAmount = deriveSeminarInscriptionThresholds({
      priceAmount: row.storedPriceAmount,
      requiredDepositPercentage: row.requiredDepositPercentage,
    }).depositAmount;
    const allocatedAmount = Number(row.allocatedAmount);
    const losesPlace =
      isSeminarInscriptionCovered({
        allocatedAmount,
        storedDepositAmount,
        withdrawn: false,
      }) &&
      !isSeminarInscriptionCovered({
        allocatedAmount: allocatedAmount - row.releasedAmount,
        storedDepositAmount,
        withdrawn: false,
      });
    const impact = impacts.get(row.seminarId) ?? {
      allocatedAmount: 0,
      id: row.seminarId,
      kind: "seminar" as const,
      losingPlaceCount: 0,
      name: row.instructorName,
    };

    impacts.set(row.seminarId, {
      ...impact,
      allocatedAmount: impact.allocatedAmount + row.releasedAmount,
      losingPlaceCount: impact.losingPlaceCount + (losesPlace ? 1 : 0),
    });
  }

  return [...impacts.values()];
}

async function readChoreographyImpacts(input: {
  academyId: string;
  eventId: string;
  paymentId: string;
}): Promise<PaymentDeletionImpact[]> {
  const affected = await db
    .select({
      amount: paymentAllocations.amount,
      choreographyId: choreographyDancers.choreographyId,
      choreographyName: choreographies.name,
      inscriptionId: restrictedChoreographyInscriptionId,
    })
    .from(paymentAllocations)
    .innerJoin(
      choreographyDancers,
      eq(paymentAllocations.choreographyInscriptionId, choreographyDancers.id),
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

  return choreographyIds.map((choreographyId) => ({
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
    kind: "choreography" as const,
    name: nameByChoreography.get(choreographyId) ?? "",
  }));
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
  Extract<PaymentDeletionImpact, { kind: "choreography" }>,
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
        ? deriveMinimumFinancialStatus(statusesAfter)
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
      inscriptionId: restrictedChoreographyInscriptionId,
    })
    .from(paymentAllocations)
    .where(
      inArray(paymentAllocations.choreographyInscriptionId, inscriptionIds),
    );

  for (const row of rows) {
    allocatedByInscription.set(
      row.inscriptionId,
      (allocatedByInscription.get(row.inscriptionId) ?? 0) + row.amount,
    );
  }

  return allocatedByInscription;
}
