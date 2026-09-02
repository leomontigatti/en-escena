import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
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

  return {
    choreography: {
      allocatedAmount: choreographyFinanceRow.allocatedAmount,
      choreographyNumber: choreographyFinanceRow.choreographyNumber,
      depositAmount: choreographyFinanceRow.depositAmount,
      financialStatus: choreographyFinanceRow.financialStatus,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      owedBalanceAmount: choreographyFinanceRow.owedBalanceAmount,
      totalAmount: choreographyFinanceRow.totalAmount,
    },
    inscriptions: await readChoreographyInscriptionRows({
      academyEventInscriptions: financeDetail.inscriptions,
      choreographyId,
    }),
  };
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}
