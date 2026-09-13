import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import {
  resolveSeminarInscriptions,
  type SeminarInscriptionFinanceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";

/**
 * One row of the `(seminar, academy)` financial detail: who is registered and
 * what their inscription owes. It is the seminar twin of
 * `ChoreographyInscriptionRow` and differs in exactly two places, both of them
 * consequences of the domain rather than of the screen:
 *
 * - **There is no row without an inscription.** A choreography detail lists the
 *   whole roster because the roster is the choreography; a seminar is joined one
 *   person at a time, so the inscriptions *are* the list.
 * - **There is no `Descuento por bailarín`**, so `dancerDiscountAmount` is a
 *   constant zero. It travels all the same because the money dialog derives its
 *   figures through the shared owner, which takes the discount as an input.
 *
 * Withdrawn rows are read on purpose: the financial detail is where the money a
 * withdrawal retained is accounted for, and the `Estado` column badges it.
 */
export type SeminarInscriptionFinanceDetailRow = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  dancerDiscountAmount: number;
  depositAmount: number | null;
  /** The **effective** row — name, amount and the `Seña` it implies — which is
   * what the shared money dialog reads out and what the `Precio` column names. */
  effectivePrice: {
    amount: number;
    depositAmount: number;
    id: string;
    name: string;
  } | null;
  financialStatus: InscriptionFinancialStatus;
  firstName: string;
  inscriptionId: string;
  lastName: string;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  totalAmount: number | null;
  withdrawn: boolean;
};

type SeminarPersonRow = SeminarInscriptionFinanceRow & {
  firstName: string;
  lastName: string;
};

/**
 * Every inscription one academy holds in one seminar, with its figures already
 * derived through the shared seminar resolution — the same call the academy's
 * rollup makes — so the detail and the tab above it cannot quote two prices for
 * one inscription.
 *
 * The academy is read **through the person**, which is why both roster tables
 * are joined and whichever half is filled answers.
 */
export async function readSeminarInscriptionFinanceRows(input: {
  academyId: string;
  eventId: string;
  seminarId: string;
}): Promise<SeminarInscriptionFinanceDetailRow[]> {
  const personRows = await readSeminarPersonRows(input);
  const resolutions = await resolveSeminarInscriptions(db, {
    eventId: input.eventId,
    rows: personRows,
  });

  return personRows
    .flatMap((person) => {
      const resolution = resolutions.get(person.id);

      return resolution
        ? [
            {
              allocatedAmount: resolution.allocatedAmount,
              anomalies: resolution.anomalies,
              dancerDiscountAmount: 0,
              depositAmount: resolution.depositAmount,
              effectivePrice:
                resolution.priceRow === null ||
                resolution.thresholds.depositAmount === null
                  ? null
                  : {
                      amount: resolution.priceRow.amount,
                      depositAmount: resolution.thresholds.depositAmount,
                      id: resolution.priceRow.id,
                      name: resolution.priceRow.name,
                    },
              financialStatus: resolution.financialStatus,
              firstName: person.firstName,
              inscriptionId: person.id,
              lastName: person.lastName,
              overAllocatedAmount: resolution.overAllocatedAmount,
              owedBalanceAmount: resolution.owedBalanceAmount,
              owedDepositAmount: resolution.owedDepositAmount,
              totalAmount: resolution.totalAmount,
              withdrawn: resolution.withdrawn,
            } satisfies SeminarInscriptionFinanceDetailRow,
          ]
        : [];
    })
    .sort(
      (first, second) =>
        first.lastName.localeCompare(second.lastName, "es-AR") ||
        first.firstName.localeCompare(second.firstName, "es-AR"),
    );
}

async function readSeminarPersonRows(input: {
  academyId: string;
  eventId: string;
  seminarId: string;
}): Promise<SeminarPersonRow[]> {
  const academyId = sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`;

  return db
    .select({
      dancerId: seminarInscriptions.dancerId,
      firstName: sql<string>`coalesce(${dancers.firstName}, ${professors.firstName})`,
      id: seminarInscriptions.id,
      lastName: sql<string>`coalesce(${dancers.lastName}, ${professors.lastName})`,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        eq(seminars.eventId, input.eventId),
        eq(academyId, input.academyId),
      ),
    );
}
