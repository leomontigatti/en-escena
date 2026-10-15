import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  payments,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import type { OwnerKind } from "@/lib/academies/owner-kind";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import {
  emptyOperationalFinanceSummary,
  type OperationalFinanceAmount,
} from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceSummaries } from "@/lib/finances/operational-summary.server";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

export type FinanceAccountRow = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  depositAmount: OperationalFinanceAmount;
  kind: OwnerKind;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
};

export async function loadFinancesList(request: Request) {
  await requireAdminPanelWriter(request);
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
        kind: true,
        name: true,
      },
      // Both owner kinds (ADR-0019): an individual's money is administration's
      // to operate as an academy's, and the `Tipo` facet tells them apart.
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
        kind: academy.kind,
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
      .selectDistinct({ academyId: seminarInscriptionPerson.academyId })
      .from(seminarInscriptions)
      .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
      .innerJoin(
        seminarInscriptionPerson,
        eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
      )
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
