import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadPortalAcademyFinances(request: Request) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      choreographyFinanceRows: [],
      seminarFinanceRows: [],
      summary: emptyOperationalFinanceSummary(),
    };
  }

  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId: academy.id,
    eventId: eventContext.activeEvent.id,
  });

  return {
    activeEvent: eventContext.activeEvent,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    // The academy's `(seminar, academy)` units. They are a second list and not a
    // second summary: the tabs split the tables, and `Saldo disponible` above
    // them stays the one pool both kinds are paid out of.
    seminarFinanceRows: financeDetail.seminarFinanceRows,
    summary: financeDetail.summary,
  };
}
