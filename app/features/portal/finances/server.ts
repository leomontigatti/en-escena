import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readLinkedIndividualSeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";

import {
  type PortalSeminarFinanceRow,
  withLinkedIndividualsOnlySeminars,
} from "./linked-individual-seminars.server";

export async function loadPortalAcademyFinances(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      choreographyFinanceRows: [],
      seminarFinanceRows: [] as PortalSeminarFinanceRow[],
      summary: emptyOperationalFinanceSummary(),
    };
  }

  const scope = { academyId: academy.id, eventId: eventContext.activeEvent.id };
  const [financeDetail, linkedInscriptions] = await Promise.all([
    readAcademyEventOperationalFinanceDetail(scope),
    readLinkedIndividualSeminarInscriptions(scope),
  ]);

  return {
    activeEvent: eventContext.activeEvent,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    // The academy's `(seminar, academy)` units. They are a second list and not a
    // second summary: the tabs split the tables, and `Saldo disponible` above
    // them stays the one pool both kinds are paid out of. A seminar only its
    // linked individuals are in is listed too, at zero, after the summary was
    // derived without it.
    seminarFinanceRows: withLinkedIndividualsOnlySeminars({
      academyId: academy.id,
      linkedInscriptions,
      seminarFinanceRows: financeDetail.seminarFinanceRows,
    }),
    summary: financeDetail.summary,
  };
}
