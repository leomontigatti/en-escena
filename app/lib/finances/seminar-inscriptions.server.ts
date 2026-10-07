import { and, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
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
 * One seminar inscription with what it owes: a row of the `(seminar, academy)`
 * financial detail, and of the event-wide seminar inscriptions list, which is
 * why it names its academy and its seminar. It is the seminar twin of
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
  academyId: string;
  academyName: string;
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
  instructorName: string;
  lastName: string;
  overAllocatedAmount: number | null;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  scheduledDate: string;
  seminarId: string;
  totalAmount: number | null;
  withdrawn: boolean;
};

type SeminarPersonRow = SeminarInscriptionFinanceRow & {
  academyId: string;
  academyName: string;
  firstName: string;
  instructorName: string;
  lastName: string;
  scheduledDate: string;
};

/**
 * Which inscriptions to read: every one of the event, or the ones one academy
 * holds in one seminar. The pair travels whole because it is the unit a detail
 * is about; half of it names no screen.
 */
export type SeminarInscriptionFinanceScope =
  | { eventId: string }
  | { academyId: string; eventId: string; seminarId: string };

/**
 * The seminar inscriptions of the scope, with their figures already derived
 * through the shared seminar resolution — the same call the academy's rollup
 * makes — so the detail, the tab above it and the event-wide list cannot quote
 * two prices for one inscription.
 *
 * The academy is read **through the person**, which is why both roster tables
 * are joined and whichever half is filled answers.
 */
export async function readSeminarInscriptionFinanceRows(
  input: SeminarInscriptionFinanceScope,
): Promise<SeminarInscriptionFinanceDetailRow[]> {
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
              academyId: person.academyId,
              academyName: person.academyName,
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
              instructorName: person.instructorName,
              lastName: person.lastName,
              overAllocatedAmount: resolution.overAllocatedAmount,
              owedBalanceAmount: resolution.owedBalanceAmount,
              owedDepositAmount: resolution.owedDepositAmount,
              scheduledDate: person.scheduledDate,
              seminarId: person.seminarId,
              totalAmount: resolution.totalAmount,
              withdrawn: resolution.withdrawn,
            } satisfies SeminarInscriptionFinanceDetailRow,
          ]
        : [];
    })
    .sort(byAcademyThenPersonThenSeminar);
}

/** Within one `(seminar, academy)` pair this is the person order alone. */
function byAcademyThenPersonThenSeminar(
  first: SeminarInscriptionFinanceDetailRow,
  second: SeminarInscriptionFinanceDetailRow,
) {
  return (
    first.academyName.localeCompare(second.academyName, "es-AR") ||
    first.lastName.localeCompare(second.lastName, "es-AR") ||
    first.firstName.localeCompare(second.firstName, "es-AR") ||
    first.scheduledDate.localeCompare(second.scheduledDate)
  );
}

async function readSeminarPersonRows(
  input: SeminarInscriptionFinanceScope,
): Promise<SeminarPersonRow[]> {
  const academyId = sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`;
  const conditions: SQL[] = [eq(seminars.eventId, input.eventId)];

  if ("seminarId" in input) {
    conditions.push(
      eq(seminarInscriptions.seminarId, input.seminarId),
      eq(academyId, input.academyId),
    );
  }

  return db
    .select({
      academyId,
      academyName: academies.name,
      dancerId: seminarInscriptions.dancerId,
      firstName: sql<string>`coalesce(${dancers.firstName}, ${professors.firstName})`,
      id: seminarInscriptions.id,
      instructorName: seminars.instructorName,
      lastName: sql<string>`coalesce(${dancers.lastName}, ${professors.lastName})`,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .innerJoin(academies, eq(academies.id, academyId))
    .where(and(...conditions));
}
