import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, dancers } from "@/db/schema";
import type { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

type AcademyEventFinanceInscriptions = Awaited<
  ReturnType<typeof readAcademyEventOperationalFinanceDetail>
>["inscriptions"];

export type ChoreographyInscriptionRow = {
  balanceAmount: number | null;
  basePriceAmount: number | null;
  dancerId: string;
  depositAmount: number | null;
  discountAmount: number;
  finalPriceAmount: number | null;
  firstName: string;
  /** `null` para un bailarín del roster que todavía no tiene inscripción. */
  inscriptionId: string | null;
  lastName: string;
  state: AcademyEventFinanceInscriptions[number]["state"];
};

/**
 * Una fila por bailarín del roster, aunque todavía no tenga inscripción: el
 * roster es la lista que la academia ve, y un bailarín sin inscripción lee como
 * `impaga` sin importes.
 */
export async function readChoreographyInscriptionRows(input: {
  academyEventInscriptions: AcademyEventFinanceInscriptions;
  choreographyId: string;
}): Promise<ChoreographyInscriptionRow[]> {
  const inscriptionsByDancer = new Map(
    input.academyEventInscriptions
      .filter(
        (inscription) => inscription.choreographyId === input.choreographyId,
      )
      .map((inscription) => [inscription.dancerId, inscription]),
  );
  const participationRows = await db
    .select({
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(eq(choreographyDancers.choreographyId, input.choreographyId))
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

  return participationRows.map((participation) =>
    toInscriptionRow(
      participation,
      inscriptionsByDancer.get(participation.dancerId),
    ),
  );
}

function toInscriptionRow(
  participation: { dancerId: string; firstName: string; lastName: string },
  inscription: AcademyEventFinanceInscriptions[number] | undefined,
): ChoreographyInscriptionRow {
  if (!inscription) {
    return {
      ...participation,
      inscriptionId: null,
      state: "impaga",
      basePriceAmount: null,
      depositAmount: null,
      balanceAmount: null,
      discountAmount: 0,
      finalPriceAmount: null,
    };
  }

  return {
    ...participation,
    inscriptionId: inscription.id,
    state: inscription.state,
    basePriceAmount: inscription.basePriceAmount,
    depositAmount: inscription.depositAmount,
    balanceAmount: inscription.balanceAmount,
    discountAmount: inscription.dancerDiscountAmount,
    finalPriceAmount: inscription.finalPriceAmount,
  };
}
