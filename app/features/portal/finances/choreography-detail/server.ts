import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

const choreographyNotFoundMessage = "No encontramos esa coreografía.";

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
  // El read-model ya viene acotado a la academia del usuario, así que una
  // coreografía ajena es indistinguible de una inexistente.
  const choreographyFinanceRow = financeDetail.choreographyFinanceRows.find(
    (row) => row.id === choreographyId,
  );

  if (!choreographyFinanceRow) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return {
    choreography: {
      balanceAmount: choreographyFinanceRow.balanceAmount,
      depositAmount: choreographyFinanceRow.depositAmount,
      depositCompletedOn: choreographyFinanceRow.depositCompletedOn,
      financialState: choreographyFinanceRow.financialState,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      paidAmount: choreographyFinanceRow.paidAmount,
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
