import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
import { readInscriptionEffectivePrices } from "@/lib/finances/inscription-allocation.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadPortalChoreographyFinanceDetail(input: {
  params: { choreographyId?: string };
  request: Request;
}) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(input.request),
    getPortalActiveEventSummaryContext(input.request),
  ]);
  const choreographyId = readChoreographyId(input.params);

  if (!eventContext.activeEvent) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId: academy.id,
    eventId: eventContext.activeEvent.id,
  });
  // The read model already comes scoped to the user's academy, so somebody else's
  // choreography is indistinguishable from a non-existent one.
  const choreographyFinanceRow = financeDetail.choreographyFinanceRows.find(
    (row) => row.id === choreographyId,
  );

  if (!choreographyFinanceRow) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const [inscriptionRows, effectivePrices] = await Promise.all([
    readChoreographyInscriptionRows({
      academyEventInscriptions: financeDetail.inscriptions,
      choreographyId,
    }),
    readInscriptionEffectivePrices({
      choreographyId,
      eventId: eventContext.activeEvent.id,
    }),
  ]);
  // The **effective** price travels with the row, the same one the admin detail
  // shows: what the inscription is charged at, and the one its figures are
  // derived from. The academy has to be able to read which of the event's prices
  // governs each of its dancers.
  const inscriptions = inscriptionRows.map((inscription) => ({
    ...inscription,
    effectivePrice:
      inscription.inscriptionId === null
        ? null
        : (effectivePrices.get(inscription.inscriptionId) ?? null),
  }));

  return {
    // The academy's and not the choreography's: money paid but not allocated
    // belongs to no choreography. It is the same figure the list shows, kept
    // here so the five metrics read the same on both screens.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    choreography: {
      allocatedAmount: choreographyFinanceRow.allocatedAmount,
      anomalies: choreographyFinanceRow.anomalies,
      choreographyNumber: choreographyFinanceRow.choreographyNumber,
      depositAmount: choreographyFinanceRow.depositAmount,
      financialStatus: choreographyFinanceRow.financialStatus,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      overAllocatedAmount: choreographyFinanceRow.overAllocatedAmount,
      owedBalanceAmount: choreographyFinanceRow.owedBalanceAmount,
      owedDepositAmount: choreographyFinanceRow.owedDepositAmount,
      totalAmount: choreographyFinanceRow.totalAmount,
    },
    inscriptions,
  };
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}
