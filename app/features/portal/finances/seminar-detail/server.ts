import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { getSeminar } from "@/lib/seminars/repository.server";

const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The academy's `(seminar, academy)` financial detail: the administrator's
 * detail minus everything that writes. It reads the **same** rollup and the
 * same inscription reader the panel does, which is what makes it impossible for
 * the two sides to quote different figures for the same seminar.
 */
export async function loadPortalSeminarFinanceDetail(input: {
  params: { seminarId?: string };
  request: Request;
}) {
  const [{ academy }, eventContext] = await Promise.all([
    requireAcademyUser(input.request),
    getPortalActiveEventSummaryContext(input.request),
  ]);
  const seminarId = readSeminarId(input.params);

  if (!eventContext.activeEvent) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  const eventId = eventContext.activeEvent.id;
  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId: academy.id,
    eventId,
  });
  // The read model already comes scoped to the user's academy, so a seminar the
  // academy registered nobody in is indistinguishable from a non-existent one.
  const seminarFinanceRow = financeDetail.seminarFinanceRows.find(
    (row) => row.id === seminarId,
  );

  if (!seminarFinanceRow) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  const [inscriptions, seminarRow] = await Promise.all([
    readSeminarInscriptionFinanceRows({
      academyId: academy.id,
      eventId,
      seminarId,
    }),
    getSeminar(seminarId),
  ]);

  return {
    // The academy's and not the seminar's: money paid but not allocated belongs
    // to no seminar. It is the same figure the summary shows, so the five
    // metrics read the same on both screens.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    inscriptions,
    seminar: {
      allocatedAmount: seminarFinanceRow.allocatedAmount,
      anomalies: seminarFinanceRow.anomalies,
      // The quota minus the **covered** inscriptions, whichever academy holds
      // them: the academy has to be able to read why a new deposit of its own
      // would not be covered yet.
      availablePlaces: seminarRow?.availablePlaces ?? 0,
      depositAmount: seminarFinanceRow.depositAmount,
      financialStatus: seminarFinanceRow.financialStatus,
      id: seminarFinanceRow.id,
      instructorName: seminarFinanceRow.instructorName,
      owedBalanceAmount: seminarFinanceRow.owedBalanceAmount,
      owedDepositAmount: seminarFinanceRow.owedDepositAmount,
      registrationCount: seminarFinanceRow.registrationCount,
      scheduledDate: seminarFinanceRow.scheduledDate,
      totalAmount: seminarFinanceRow.totalAmount,
    },
  };
}

function readSeminarId(params: { seminarId?: string }) {
  if (!params.seminarId) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  return params.seminarId;
}
