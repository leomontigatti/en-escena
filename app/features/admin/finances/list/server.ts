import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  dancers,
  payments,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  emptyOperationalFinanceSummary,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceSummaries } from "@/lib/finances/operational-summary.server";

export type FinanceAccountRow = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
};

export async function loadFinancesList(request: Request) {
  await requireInternalUser(request, ["admin"]);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId: null,
    };
  }

  const academyIds = await listAcademyIdsForEvent(selectedEventId);

  if (academyIds.length === 0) {
    return {
      rows: [] as FinanceAccountRow[],
      selectedEventId,
    };
  }

  const [academyRows, summaries] = await Promise.all([
    db.query.academies.findMany({
      columns: {
        id: true,
        name: true,
      },
      where: inArray(academies.id, academyIds),
      orderBy: [academies.name],
    }),
    readAcademyEventOperationalFinanceSummaries({
      academyIds,
      eventId: selectedEventId,
    }),
  ]);

  return {
    rows: academyRows.map((academy) => {
      const summary =
        summaries.get(academy.id) ?? emptyOperationalFinanceSummary();

      return {
        academyId: academy.id,
        academyName: academy.name,
        availableBalanceAmount: summary.availableBalanceAmount,
        depositAmount: summary.depositAmount,
        totalAmount: summary.totalAmount,
        owedBalanceAmount: summary.owedBalanceAmount,
      };
    }),
    selectedEventId,
  };
}

/**
 * Every academy with money at stake in the event: a choreography, a payment or
 * a seminar inscription. The last one matters on its own because an academy
 * can register people in a seminar without registering a choreography or
 * paying anything yet, and what it owes is still owed. A seminar inscription
 * has no academy column: it is read through the person, as everywhere else.
 */
async function listAcademyIdsForEvent(eventId: string) {
  const seminarAcademyId = sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`;
  const [
    academyIdsWithChoreographies,
    academyIdsWithPayments,
    academyIdsWithSeminarInscriptions,
  ] = await Promise.all([
    db
      .selectDistinct({
        academyId: choreographies.academyId,
      })
      .from(choreographies)
      .where(eq(choreographies.eventId, eventId)),
    db
      .selectDistinct({
        academyId: payments.academyId,
      })
      .from(payments)
      .where(eq(payments.eventId, eventId)),
    db
      .selectDistinct({ academyId: seminarAcademyId })
      .from(seminarInscriptions)
      .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
      .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
      .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
      .where(eq(seminars.eventId, eventId)),
  ]);

  return [
    ...new Set([
      ...academyIdsWithChoreographies.map((row) => row.academyId),
      ...academyIdsWithPayments.map((row) => row.academyId),
      ...academyIdsWithSeminarInscriptions.map((row) => row.academyId),
    ]),
  ];
}
