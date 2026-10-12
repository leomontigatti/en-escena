import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, dancers } from "@/db/schema";
import type { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

type AcademyEventFinanceInscriptions = Awaited<
  ReturnType<typeof readAcademyEventOperationalFinanceDetail>
>["inscriptions"];

export type ChoreographyInscriptionRow = {
  allocatedAmount: number;
  anomalies: AcademyEventFinanceInscriptions[number]["anomalies"];
  basePriceAmount: number | null;
  dancerDiscountAmount: number;
  dancerId: string;
  depositAmount: number | null;
  financialStatus: AcademyEventFinanceInscriptions[number]["financialStatus"];
  firstName: string;
  /** `null` for a roster dancer who does not have an inscription yet. */
  inscriptionId: string | null;
  lastName: string;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  totalAmount: number | null;
  withdrawn: boolean;
};

/**
 * One row per inscription row of the choreography, matched to its figures by
 * the inscription's own id and never by the dancer: a withdrawal is final, so a
 * dancer added again after one holds two rows here, the withdrawn one and the
 * new one, each with its own money. A row the rollup does not carry reads as
 * `Seña pendiente` with no amounts.
 *
 * Withdrawn rows are read on purpose —the financial detail is one of the four
 * surfaces that show evidence—, which is why this query carries no
 * `activeInscription()`: the withdrawn row is what documents that its money was
 * retained.
 */
export async function readChoreographyInscriptionRows(input: {
  academyEventInscriptions: AcademyEventFinanceInscriptions;
  choreographyId: string;
}): Promise<ChoreographyInscriptionRow[]> {
  const inscriptionsById = new Map(
    input.academyEventInscriptions
      .filter(
        (inscription) => inscription.choreographyId === input.choreographyId,
      )
      .map((inscription) => [inscription.id, inscription]),
  );
  const participationRows = await db
    .select({
      id: choreographyDancers.id,
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(eq(choreographyDancers.choreographyId, input.choreographyId))
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

  return participationRows.map(({ id, ...participation }) =>
    toInscriptionRow(participation, inscriptionsById.get(id)),
  );
}

function toInscriptionRow(
  participation: { dancerId: string; firstName: string; lastName: string },
  inscription: AcademyEventFinanceInscriptions[number] | undefined,
): ChoreographyInscriptionRow {
  if (!inscription) {
    return {
      ...participation,
      allocatedAmount: 0,
      anomalies: [],
      basePriceAmount: null,
      dancerDiscountAmount: 0,
      depositAmount: null,
      financialStatus: "depositPending",
      inscriptionId: null,
      overAllocatedAmount: null,
      owedBalanceAmount: null,
      owedDepositAmount: null,
      totalAmount: null,
      withdrawn: false,
    };
  }

  return {
    ...participation,
    allocatedAmount: inscription.allocatedAmount,
    anomalies: inscription.anomalies,
    basePriceAmount: inscription.basePriceAmount,
    dancerDiscountAmount: inscription.dancerDiscountAmount,
    depositAmount: inscription.depositAmount,
    financialStatus: inscription.financialStatus,
    inscriptionId: inscription.id,
    overAllocatedAmount: inscription.overAllocatedAmount,
    owedBalanceAmount: inscription.owedBalanceAmount,
    owedDepositAmount: inscription.owedDepositAmount,
    totalAmount: inscription.totalAmount,
    withdrawn: inscription.withdrawn,
  };
}
