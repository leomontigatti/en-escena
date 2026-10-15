import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { listOwnerEventComprobantes } from "@/lib/comprobantes/owner-comprobantes.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { readOwnerEventPayments } from "@/lib/finances/owner-event-payments.server";
import { getPortalActiveEventPaymentInstructionsContext } from "@/lib/portal/event-context.server";

/**
 * The individual's `Finanzas`: the portal's finance summary read over its own
 * owner row (ADR-0019), so the figures are the ones administration sees. An
 * individual holds seminar inscriptions only, so there is no choreography
 * list; the payments and the comprobantes sit on the same page because the
 * individual has no other screen to read them on, and so do the event's
 * `Instrucciones de pago`, which the portal shows on its `Pagos`.
 */
export async function loadIndividualFinances(request: Request) {
  const [{ individual }, eventContext] = await Promise.all([
    requireIndividualUser(request),
    getPortalActiveEventPaymentInstructionsContext(request),
  ]);

  if (!eventContext.activeEvent) {
    return {
      activeEvent: null,
      comprobantes: [],
      paymentInstructions: null,
      payments: [],
      seminarFinanceRows: [],
      summary: emptyOperationalFinanceSummary(),
    };
  }

  const scope = {
    academyId: individual.ownerId,
    eventId: eventContext.activeEvent.id,
  };
  const [financeDetail, payments, comprobantes] = await Promise.all([
    readAcademyEventOperationalFinanceDetail(scope),
    readOwnerEventPayments(scope),
    listOwnerEventComprobantes(scope),
  ]);

  return {
    activeEvent: eventContext.activeEvent,
    comprobantes,
    paymentInstructions: eventContext.paymentInstructions,
    payments,
    seminarFinanceRows: financeDetail.seminarFinanceRows,
    summary: financeDetail.summary,
  };
}
