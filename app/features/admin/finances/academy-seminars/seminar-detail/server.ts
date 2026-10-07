import { redirect } from "react-router";

import { runSeminarInscriptionMoneyIntent } from "@/features/admin/finances/inscription-money/seminar-money-action.server";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import {
  handleEmitComprobante,
  handleRecheckComprobante,
} from "@/features/admin/finances/comprobante-emission/handlers.server";
import {
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { seminarAnchor } from "@/lib/comprobantes/anchor";
import {
  getFacturaCEmissionDeps,
  resolveAnchorBillable,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import {
  readSeminarInscriptionPriceOptions,
  type SeminarInscriptionPriceOption,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { getSeminar } from "@/lib/seminars/repository.server";

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
  await requireInternalUser(input.request, ["admin"]);

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
      inscriptions: [],
      invoicing: { billableAmount: 0, canEmit: false },
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

  const [inscriptions, priceOptions, seminarRow, invoicing] = await Promise.all(
    [
      readSeminarInscriptionFinanceRows({ academyId, eventId, seminarId }),
      readSeminarInscriptionPriceOptions({ eventId, seminarId }),
      getSeminar(seminarId),
      readSeminarInvoicing(seminarId, academyId),
    ],
  );

  return {
    academy,
    // The academy's and not the seminar's: money collected but not allocated
    // belongs to neither, and it is the pool the allocations made here come out
    // of.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
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

type SeminarInvoicing = {
  // The collected remainder of this `(seminar, academy)` unit that no
  // comprobante in force covers yet. Emission bills exactly this.
  billableAmount: number;
  canEmit: boolean;
};

/**
 * The detail's emission axis, read off the same resolver the emitter bills
 * from, so the affordance and the write cannot disagree about whether there is
 * anything to invoice.
 */
async function readSeminarInvoicing(
  seminarId: string,
  academyId: string,
): Promise<SeminarInvoicing> {
  const billable = await resolveAnchorBillable(
    seminarAnchor(seminarId, academyId),
  );

  return { billableAmount: billable.total, canEmit: billable.total > 0 };
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
  resolveEmissionDeps?: () => FacturaCEmissionDeps;
}): Promise<SeminarFinanceActionData | never> {
  await requireAdminUser(input.request);

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
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");
  const emissionContext = {
    anchor: seminarAnchor(seminarId, academyId),
    detailUrl: seminarFinanceDetailUrl(academyId, seminarId, eventId),
    eventId,
    resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
  };

  if (intent === emitComprobanteIntent) {
    return await handleEmitComprobante({
      ...emissionContext,
      confirm: String(formData.get("confirm") ?? ""),
    });
  }

  if (intent === recheckComprobanteIntent) {
    return await handleRecheckComprobante({
      ...emissionContext,
      cbteNro: String(formData.get("cbteNro") ?? ""),
    });
  }

  const result = await runSeminarInscriptionMoneyIntent({ eventId, formData });

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
