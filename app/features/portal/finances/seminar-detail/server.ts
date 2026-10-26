import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import type { InscriptionFinanceRow } from "@/lib/finances/inscription-finance-columns";
import {
  readLinkedIndividualSeminarInscriptions,
  type LinkedIndividualSeminarInscriptionRow,
} from "@/lib/seminars/linked-individual-inscriptions.server";
import { getSeminar } from "@/lib/seminars/repository.server";

import { withLinkedIndividualsOnlySeminars } from "../linked-individual-seminars.server";

const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The academy's `(seminar, academy)` financial detail: the administrator's
 * detail minus everything that writes. It reads the **same** rollup and the
 * same inscription reader the panel does, which is what makes it impossible for
 * the two sides to quote different money figures for the same seminar.
 * `Inscriptos` counts the linked individuals' inscriptions too, as the panel's
 * `Seminarios` tab does; only this detail lists their rows, since
 * administration reads them on each individual's own page.
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
  const [financeDetail, linkedIndividualInscriptions] = await Promise.all([
    readAcademyEventOperationalFinanceDetail({
      academyId: academy.id,
      eventId,
    }),
    readLinkedIndividualSeminarInscriptions({
      academyId: academy.id,
      eventId,
      seminarId,
    }),
  ]);
  // The read model already comes scoped to the user's academy, so a seminar
  // neither the academy nor its linked individuals are in is
  // indistinguishable from a non-existent one. One only its linked
  // individuals are in reads at zero, as the summary lists it.
  const seminarFinanceRow = withLinkedIndividualsOnlySeminars({
    academyId: academy.id,
    linkedInscriptions: linkedIndividualInscriptions,
    seminarFinanceRows: financeDetail.seminarFinanceRows,
  }).find((row) => row.id === seminarId);

  if (!seminarFinanceRow) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  // One instant for both readings, so a row's `Reservada` badge and the
  // places left agree.
  const now = new Date();
  const [inscriptions, seminarRow] = await Promise.all([
    readSeminarInscriptionFinanceRows(
      { academyId: academy.id, eventId, seminarId },
      now,
    ),
    getSeminar(seminarId, now),
  ]);

  return {
    // The academy's and not the seminar's: money paid but not allocated belongs
    // to no seminar. It is the same figure the summary shows, so the five
    // metrics read the same on both screens.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    // The linked individuals' rows are added here, after the figures above
    // were derived without them: they owe the academy nothing.
    inscriptions: [
      ...inscriptions,
      ...linkedIndividualInscriptions.map(toLinkedIndividualFinanceRow),
    ],
    seminar: {
      allocatedAmount: seminarFinanceRow.allocatedAmount,
      anomalies: seminarFinanceRow.anomalies,
      // The seminar's places, whichever academy holds them: the academy has to
      // be able to read why a new deposit of its own would not be covered yet.
      availablePlaces: seminarRow?.availablePlaces ?? 0,
      isFull: seminarRow?.isFull ?? true,
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

/**
 * A linked individual's inscription as the academy's finances read it: `$0`
 * and badged `Particular`, like a `Bonificada` row, though it is not waived:
 * its owner pays it, and none of that money is shown here. `paidInFull` is the
 * harmless status to carry, since nothing is owed; the badge replaces it.
 */
function toLinkedIndividualFinanceRow(
  inscription: LinkedIndividualSeminarInscriptionRow,
) {
  return {
    allocatedAmount: 0,
    anomalies: [],
    depositAmount: 0,
    effectivePrice: null,
    financialStatus: "paidInFull",
    firstName: inscription.firstName,
    inscriptionId: inscription.inscriptionId,
    lastName: inscription.lastName,
    linkedIndividual: true,
    owedBalanceAmount: 0,
    totalAmount: 0,
    withdrawn: false,
  } satisfies InscriptionFinanceRow & {
    firstName: string;
    inscriptionId: string;
    lastName: string;
  };
}

function readSeminarId(params: { seminarId?: string }) {
  if (!params.seminarId) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  return params.seminarId;
}
