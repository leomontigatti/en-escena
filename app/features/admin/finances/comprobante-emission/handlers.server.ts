import { redirect } from "react-router";

import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import type { ComprobanteAnchor } from "@/lib/comprobantes/anchor";
import {
  emitFacturaC,
  recheckFacturaC,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import type { NotificationKey } from "@/lib/shared/notification-toasts";

import {
  emitComprobanteConfirmValue,
  type ComprobanteEmissionActionData,
} from "./shared";

/*
 * The financial detail's emission axis: emitting the `Factura C` and re-verifying
 * an emission left unresolved (ADR-0011, ADR-0012). It lives apart from the
 * detail's server because it is the only part that talks to ARCA and the only
 * one that decides between redirecting and staying in the dialog.
 *
 * It takes the anchor and the URL to come back to, so the choreography detail
 * and the `(seminar, academy)` detail share one writer.
 */

export type ComprobanteEmissionContext = {
  anchor: ComprobanteAnchor;
  detailUrl: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
};

/**
 * Triggers the invoice C emission after the irreversible confirmation. An
 * approved CAE reloads the detail (`Vigente` badge); a rejection or contingency
 * from ARCA comes back as `emission-error` with the raw state, without
 * persisting anything or leaving the UI inconsistent (the reload only happens on
 * the happy path).
 */
export async function handleEmitComprobante(
  input: ComprobanteEmissionContext & { confirm: string },
): Promise<ComprobanteEmissionActionData | never> {
  if (input.confirm !== emitComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la emisión irreversible para continuar.",
    };
  }

  const outcome = await emitFacturaC(
    { anchor: input.anchor, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  if (outcome.ok) {
    // A recovered emission redirects like any other, so the notice travels by
    // flash session (docs/agents/form-feedback.md). It deliberately does not look
    // like the dialog's `recovered`: that way the operator can tell "it recovered
    // on its own" from "I recovered it myself".
    throw await redirectToDetail(
      input.detailUrl,
      outcome.recovered ? "comprobante-recuperado" : undefined,
    );
  }

  return toContingencyActionData(outcome);
}

/**
 * Queries ARCA again for the emission left unresolved, without leaving the dialog
 * (#577). Only the sequence number is read from the form: the amount and the date
 * the queried comprobante is validated against are recomputed by
 * `recheckFacturaC` from the anchor (ADR-0012 decision 4).
 */
export async function handleRecheckComprobante(
  input: ComprobanteEmissionContext & { cbteNro: string },
): Promise<ComprobanteEmissionActionData> {
  const cbteNro = Number(input.cbteNro);

  if (!Number.isInteger(cbteNro) || cbteNro <= 0) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckFacturaC(
    { anchor: input.anchor, cbteNro, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  // Recovery by re-verification stays in the dialog: it does not cross a
  // redirect, so it arrives as alert state and not as a toast.
  if (outcome.ok) {
    return { status: "contingency", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

function redirectToDetail(detailUrl: string, notification?: NotificationKey) {
  return notification
    ? redirectWithFlashNotification(detailUrl, notification)
    : redirect(detailUrl);
}
