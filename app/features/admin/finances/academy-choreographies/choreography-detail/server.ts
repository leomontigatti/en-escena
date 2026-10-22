import { redirect } from "react-router";

import { readAnchorComprobantes } from "@/features/admin/finances/anchor-comprobantes/server";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { type ComprobanteEmissionDeps } from "@/lib/comprobantes/emit-comprobante.server";
import { getComprobanteEmissionDeps } from "@/lib/comprobantes/emission-config.server";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
import {
  allocateToInscription,
  readInscriptionEffectivePrices,
  readInscriptionPriceOptions,
  releaseInscriptionExcess,
  removeFromInscription,
} from "@/lib/finances/inscription-allocation.server";
import {
  unwaiveInscriptions,
  waiveInscriptions,
} from "@/lib/finances/inscription-waiver.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

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
import {
  allocateInscriptionIntent,
  readAllocationTargetKind,
  readMoneyAmount,
  readPickedPriceId,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "@/features/admin/finances/inscription-money/intents";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  choreographyDetailUrl,
  type ChoreographyFinanceActionData,
  unwaiveChoreographyIntent,
  unwaiveInscriptionIntent,
  waiveChoreographyIntent,
  waiveInscriptionIntent,
  type WaiverIntent,
  waiverIntents,
} from "./shared";

export async function loadChoreographyFinanceDetail(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
}) {
  await requireAdminPanelWriter(input.request);

  const academyId = readFinanceAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const [academy, eventContext] = await Promise.all([
    readFinanceAcademy(academyId),
    loadEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      availableBalanceAmount: 0,
      choreography: null,
      comprobantes: [],
      inscriptions: [],
      priceOptions: [],
      selectedEventId: null,
    };
  }

  const eventId = eventContext.selectedEventId;
  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId,
    eventId,
  });
  const choreographyFinanceRow = financeDetail.choreographyFinanceRows.find(
    (row) => row.id === choreographyId,
  );

  if (!choreographyFinanceRow) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const [
    inscriptionRows,
    effectivePrices,
    priceOptions,
    invoicing,
    comprobantes,
  ] = await Promise.all([
    readChoreographyInscriptionRows({
      academyEventInscriptions: financeDetail.inscriptions,
      choreographyId,
    }),
    readInscriptionEffectivePrices({ choreographyId, eventId }),
    readInscriptionPriceOptions({ choreographyId, eventId }),
    readAnchorInvoicing({
      anchor: choreographyAnchor(choreographyId),
      eventId,
    }),
    readAnchorComprobantes(choreographyAnchor(choreographyId)),
  ]);
  // One price travels with the row: the **effective** one, what the inscription
  // is charged at. It is the figure the dialog reads out, the row the picker
  // opens on and the same one `basePriceAmount` carries, so nothing on this
  // screen can name a price another part of it contradicts. The stored row is a
  // write-path concern —the `crossed` test reads it from the database— and no
  // longer travels to the client.
  const inscriptions = inscriptionRows.map((inscription) => ({
    ...inscription,
    effectivePrice:
      inscription.inscriptionId === null
        ? null
        : (effectivePrices.get(inscription.inscriptionId) ?? null),
  }));

  return {
    academy,
    // The academy's and not the choreography's: money collected but not
    // allocated belongs to neither. It travels this far because it is the pool
    // every allocation made in this detail comes out of.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    invoicing,
    comprobantes,
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
      withdrawn: choreographyFinanceRow.withdrawn,
    },
    inscriptions,
    priceOptions,
    selectedEventId: eventId,
  };
}

export async function handleChoreographyFinanceAction(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
  // Injectable emission inputs: the tests pass a mocked ARCA client; in
  // production they are resolved from the environment (cert+key, sales point).
  resolveEmissionDeps?: () => ComprobanteEmissionDeps;
}): Promise<ChoreographyFinanceActionData | never> {
  await requireAdminPanelWriter(input.request);

  const academyId = readFinanceAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar la coreografía.",
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await readFormData(input.request);
  const intent = String(formData.get("intent") ?? "");

  if (
    intent === allocateInscriptionIntent ||
    intent === removeInscriptionMoneyIntent ||
    intent === releaseInscriptionExcessIntent
  ) {
    const result = await runInscriptionMoneyIntent({
      academyId,
      choreographyId,
      eventId,
      formData,
      intent,
    });

    if (result !== null) {
      return result;
    }

    throw redirectToDetail(academyId, choreographyId, eventId);
  }

  if (isWaiverIntent(intent)) {
    return await runWaiverIntent({
      academyId,
      choreographyId,
      eventId,
      formData,
      intent,
    });
  }

  const emissionContext = {
    anchor: { kind: "choreography", choreographyId } as const,
    detailUrl: choreographyDetailUrl(academyId, choreographyId, eventId),
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

  return { status: "error", message: "No pudimos procesar esa acción." };
}

/**
 * The three money gestures of an inscription, which differ only in what they
 * read off the form: an amount for two of them and nothing at all for the
 * release, whose figure is computed. Returns `null` when the write succeeded,
 * so the caller redirects; an error otherwise, which keeps the dialog open with
 * what the administrator typed.
 */
async function runInscriptionMoneyIntent(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
  intent: string;
}): Promise<ChoreographyFinanceActionData | null> {
  const inscriptionId = String(
    input.formData.get("inscriptionId") ?? "",
  ).trim();

  // The shared dialog names the kind it is about, and this action owns one of
  // them: a seminar target reaching here is a form pointed at the wrong writer,
  // not a choreography inscription that went missing.
  if (readAllocationTargetKind(input.formData) !== "choreography") {
    return { status: "error", message: "No pudimos procesar esa acción." };
  }

  if (!inscriptionId) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  const target = {
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    inscriptionId,
  };

  if (input.intent === releaseInscriptionExcessIntent) {
    const result = await releaseInscriptionExcess(target);

    return result.ok ? null : { status: "error", message: result.message };
  }

  const amount = readMoneyAmount(input.formData);

  if (amount === null) {
    return { status: "error", message: "Ingresá un monto mayor a 0." };
  }

  const result =
    input.intent === allocateInscriptionIntent
      ? await allocateToInscription({
          ...target,
          amount,
          priceId: readPickedPriceId(input.formData),
        })
      : await removeFromInscription({ ...target, amount });

  return result.ok ? null : { status: "error", message: result.message };
}

function isWaiverIntent(intent: string): intent is WaiverIntent {
  return (waiverIntents as readonly string[]).includes(intent);
}

const waiverSuccessMessages = {
  [waiveInscriptionIntent]: "Inscripción bonificada.",
  [unwaiveInscriptionIntent]: "Bonificación quitada.",
  [waiveChoreographyIntent]: "Coreografía bonificada.",
  [unwaiveChoreographyIntent]: "Bonificación quitada.",
} satisfies Record<WaiverIntent, string>;

/**
 * The `Bonificada` waiver, of one inscription or of the whole choreography. It
 * stays on the page (form-feedback matrix): the loader revalidates, and the
 * outcome travels back as a toast.
 */
async function runWaiverIntent(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
  intent: WaiverIntent;
}): Promise<ChoreographyFinanceActionData> {
  const waiver = {
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    scope:
      input.intent === waiveInscriptionIntent ||
      input.intent === unwaiveInscriptionIntent
        ? {
            inscriptionId: String(
              input.formData.get("inscriptionId") ?? "",
            ).trim(),
            kind: "inscription" as const,
          }
        : { kind: "choreography" as const },
  };
  const result =
    input.intent === waiveInscriptionIntent ||
    input.intent === waiveChoreographyIntent
      ? await waiveInscriptions(waiver)
      : await unwaiveInscriptions(waiver);

  return result.ok
    ? { status: "success", message: waiverSuccessMessages[input.intent] }
    : { status: "error", message: result.message };
}

function redirectToDetail(
  academyId: string,
  choreographyId: string,
  eventId: string,
) {
  return redirect(choreographyDetailUrl(academyId, choreographyId, eventId));
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}
