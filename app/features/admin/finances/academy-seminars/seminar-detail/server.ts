import { redirect } from "react-router";

import { readAnchorComprobantes } from "@/features/admin/finances/anchor-comprobantes/server";
import { runSeminarInscriptionMoneyIntent } from "@/features/admin/finances/inscription-money/seminar-money-action.server";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import {
  handleAbandonReservation,
  handleEmitComprobante,
  handleRecheckComprobante,
  readAnchorInvoicing,
} from "@/features/admin/finances/comprobante-emission/handlers.server";
import {
  abandonReservationIntent,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { seminarAnchor } from "@/lib/comprobantes/anchor";
import { type ComprobanteEmissionDeps } from "@/lib/comprobantes/emit-comprobante.server";
import { getComprobanteEmissionDeps } from "@/lib/comprobantes/emission-config.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import {
  readSeminarInscriptionPriceOptions,
  type SeminarInscriptionPriceOption,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { getSeminar } from "@/lib/seminars/repository.server";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  seminarFinanceDetailUrl,
  type SeminarFinanceActionData,
} from "./shared";

const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The `(seminar, academy)` financial detail: the twin of the choreography one,
 * read off the same academy rollup so the figures here and the row on the
 * academy's `Seminarios` tab cannot disagree.
 *
 * The seminar is titled by its **instructor alone**, which is how a seminar is
 * named everywhere on both sides; the date is what disambiguates two seminars of
 * the same instructor and it travels as the description.
 */
export async function loadSeminarFinanceDetail(input: {
  params: { academyId?: string; seminarId?: string };
  request: Request;
}) {
  await requireAdminPanelWriter(input.request);

  const academyId = readFinanceAcademyId(input.params);
  const seminarId = readSeminarId(input.params);
  const [academy, eventContext] = await Promise.all([
    readFinanceAcademy(academyId),
    loadEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      availableBalanceAmount: 0,
      comprobantes: [],
      inscriptions: [],
      invoicing: null,
      priceOptionsByInscription: {} as Record<
        string,
        SeminarInscriptionPriceOption[]
      >,
      seminar: null,
      selectedEventId: null,
    };
  }

  const eventId = eventContext.selectedEventId;
  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId,
    eventId,
  });
  const seminarFinanceRow = financeDetail.seminarFinanceRows.find(
    (row) => row.id === seminarId,
  );

  if (!seminarFinanceRow) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  const [inscriptions, priceOptions, seminarRow, invoicing, comprobantes] =
    await Promise.all([
      readSeminarInscriptionFinanceRows({ academyId, eventId, seminarId }),
      readSeminarInscriptionPriceOptions({ eventId, seminarId }),
      getSeminar(seminarId),
      readAnchorInvoicing({
        anchor: seminarAnchor(seminarId, academyId),
        eventId,
      }),
      readAnchorComprobantes(seminarAnchor(seminarId, academyId)),
    ]);

  return {
    academy,
    // The academy's and not the seminar's: money collected but not allocated
    // belongs to neither, and it is the pool the allocations made here come out
    // of.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    comprobantes,
    inscriptions,
    invoicing,
    // A plain object rather than the `Map` the reader answers: it has to survive
    // the loader's serialization on its way to the view.
    priceOptionsByInscription: Object.fromEntries(
      inscriptions.map((inscription) => [
        inscription.inscriptionId,
        priceOptions.get(inscription.inscriptionId) ?? [],
      ]),
    ),
    seminar: {
      allocatedAmount: seminarFinanceRow.allocatedAmount,
      anomalies: seminarFinanceRow.anomalies,
      // The quota minus the **covered** inscriptions, whichever academy holds
      // them: a place is taken by covering a deposit, so this is what says
      // whether the next crossing here can go through at all.
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
    selectedEventId: eventId,
  };
}

/**
 * The detail's action: the emission and the three money gestures of a seminar
 * inscription. The gestures are the shared seminar ones, keyed by the
 * inscription alone, and they are the choreography action's twin down to the
 * redirect: a write that went through leaves the dialog by revalidating the
 * detail, and a refusal comes back as a message the dialog keeps on screen.
 */
export async function handleSeminarFinanceAction(input: {
  params: { academyId?: string; seminarId?: string };
  request: Request;
  // Injectable emission inputs: the tests pass a mocked ARCA client; in
  // production they are resolved from the environment (cert+key, sales point).
  resolveEmissionDeps?: () => ComprobanteEmissionDeps;
}): Promise<SeminarFinanceActionData | never> {
  await requireAdminPanelWriter(input.request);

  const academyId = readFinanceAcademyId(input.params);
  const seminarId = readSeminarId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar el seminario.",
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await readFormData(input.request);
  const intent = String(formData.get("intent") ?? "");
  const emissionContext = {
    anchor: seminarAnchor(seminarId, academyId),
    detailUrl: seminarFinanceDetailUrl(academyId, seminarId, eventId),
    eventId,
    resolveEmissionDeps:
      input.resolveEmissionDeps ?? getComprobanteEmissionDeps,
  };

  if (intent === emitComprobanteIntent) {
    return await handleEmitComprobante({ ...emissionContext, formData });
  }

  if (intent === recheckComprobanteIntent) {
    return await handleRecheckComprobante({ ...emissionContext, formData });
  }

  if (intent === abandonReservationIntent) {
    return await handleAbandonReservation({ ...emissionContext, formData });
  }

  const result = await runSeminarInscriptionMoneyIntent({
    eventId,
    expectedScope: { academyId, seminarId },
    formData,
  });

  if (result.status === "error") {
    return result;
  }

  throw redirectToDetail(academyId, seminarId, eventId);
}

function redirectToDetail(
  academyId: string,
  seminarId: string,
  eventId: string,
) {
  return redirect(seminarFinanceDetailUrl(academyId, seminarId, eventId));
}

function readSeminarId(params: { seminarId?: string }) {
  if (!params.seminarId) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  return params.seminarId;
}
