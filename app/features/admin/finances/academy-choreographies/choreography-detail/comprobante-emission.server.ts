import { redirect } from "react-router";

import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import {
  emitChoreographyFacturaC,
  recheckChoreographyFacturaC,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import type { NotificationKey } from "@/lib/shared/notification-toasts";

import {
  choreographyDetailUrl,
  emitComprobanteConfirmValue,
  type ChoreographyFinanceActionData,
} from "./shared";

/*
 * The financial detail's emission axis: emitting the Factura C and re-verifying
 * an emission left unresolved (ADR-0011, ADR-0012). It lives apart from the
 * detail's server because it is the only part that talks to ARCA and the only
 * one that decides between redirecting and staying in the dialog.
 */

/**
 * Triggers the invoice C emission after the irreversible confirmation. An
 * approved CAE reloads the detail (`Vigente` badge); a rejection or contingency
 * from ARCA comes back as `emission-error` with the raw state, without
 * persisting anything or leaving the UI inconsistent (the reload only happens on
 * the happy path).
 */
export async function handleEmitComprobante(input: {
  academyId: string;
  choreographyId: string;
  confirm: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData | never> {
  if (input.confirm !== emitComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la emisión irreversible para continuar.",
    };
  }

  const outcome = await emitChoreographyFacturaC(
    { choreographyId: input.choreographyId, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  if (outcome.ok) {
    // A recovered emission redirects like any other, so the notice travels by
    // flash session (docs/agents/form-feedback.md). It deliberately does not look
    // like the dialog's `recovered`: that way the operator can tell "it recovered
    // on its own" from "I recovered it myself".
    throw await redirectToDetail(
      input.academyId,
      input.choreographyId,
      input.eventId,
      outcome.recovered ? "comprobante-recuperado" : undefined,
    );
  }

  return toContingencyActionData(outcome);
}

/**
 * Queries ARCA again for the emission left unresolved, without leaving the dialog
 * (#577). Only the sequence number is read from the form: the amount and the date
 * the queried comprobante is validated against are recomputed by
 * `recheckChoreographyFacturaC` from the choreography (ADR-0012 decision 4).
 */
export async function handleRecheckComprobante(input: {
  academyId: string;
  cbteNro: string;
  choreographyId: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData> {
  const cbteNro = Number(input.cbteNro);

  if (!Number.isInteger(cbteNro) || cbteNro <= 0) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckChoreographyFacturaC(
    { choreographyId: input.choreographyId, eventId: input.eventId, cbteNro },
    input.resolveEmissionDeps(),
  );

  // Recovery by re-verification stays in the dialog: it does not cross a
  // redirect, so it arrives as alert state and not as a toast.
  if (outcome.ok) {
    return { status: "contingency", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

function redirectToDetail(
  academyId: string,
  choreographyId: string,
  eventId: string,
  notification?: NotificationKey,
) {
  const url = choreographyDetailUrl(academyId, choreographyId, eventId);

  return notification
    ? redirectWithFlashNotification(url, notification)
    : redirect(url);
}
