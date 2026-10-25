import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

/**
 * The individual's `Finanzas` of its seminars: the portal's finance summary
 * read over its own owner row (ADR-0019), so the figures are the ones
 * administration sees. An individual holds seminar inscriptions only, so there
 * is no choreography list; its payments are on its `Movimientos`.
 */
export async function loadIndividualFinances(request: Request) {
  const [{ individual }, eventContext] = await Promise.all([
    requireIndividualUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      seminarFinanceRows: [],
      summary: emptyOperationalFinanceSummary(),
    };
  }

  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId: individual.ownerId,
    eventId: eventContext.activeEvent.id,
  });

  return {
    activeEvent: eventContext.activeEvent,
    seminarFinanceRows: financeDetail.seminarFinanceRows,
    summary: financeDetail.summary,
  };
}
