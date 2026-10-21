import { redirect } from "react-router";

import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import type { ComprobanteAnchor } from "@/lib/comprobantes/anchor";
import {
  emitAnchorComprobante,
  readAnchorEmissionPlan,
  recheckAnchorComprobante,
  type ComprobanteEmissionDeps,
  type ConfirmedEmission,
} from "@/lib/comprobantes/emit-comprobante.server";
import { comprobanteKinds } from "@/lib/comprobantes/kind";
import {
  emissionRefusalLabel,
  emissionRemedy,
} from "@/lib/comprobantes/emission-plan";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import type { NotificationKey } from "@/lib/shared/notification-toasts";

import {
  emitComprobanteConfirmValue,
  type AnchorInvoicing,
  type ComprobanteEmissionActionData,
} from "./shared";

/*
 * The financial detail's emission axis: emitting the document the unit owes —
 * its `Factura C`, or the debit or credit note its delta names — and
 * re-verifying an emission left unresolved (ADR-0012, ADR-0014 §5). It lives apart from the
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
  resolveEmissionDeps: () => ComprobanteEmissionDeps;
};

/**
 * Emits what the unit owes after the irreversible confirmation. An approved
 * CAE reloads the detail; a refusal, a rejection or a contingency from ARCA
 * comes back as action data with the raw state, without persisting anything or
 * leaving the UI inconsistent (the reload only happens on the happy path).
 */
export async function handleEmitComprobante(
  input: ComprobanteEmissionContext & { formData: FormData },
): Promise<ComprobanteEmissionActionData | never> {
  if (input.formData.get("confirm") !== emitComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la emisión irreversible para continuar.",
    };
  }

  const confirmed = readConfirmedEmission(input.formData);

  if (!confirmed) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a emitir.",
    };
  }

  const outcome = await emitAnchorComprobante(
    { anchor: input.anchor, eventId: input.eventId, confirmed },
    input.resolveEmissionDeps(),
  );

  if (outcome.ok) {
    // A recovered emission redirects like any other, so the notice travels by
    // flash session (docs/agents/form-feedback.md). It deliberately does not look
    // like the dialog's `recovered`: that way the operator can tell "it recovered
    // on its own" from "I recovered it myself".
    throw await redirectToDetail(
      input.detailUrl,
      outcome.recovered ? "comprobante-recovered" : undefined,
    );
  }

  return toContingencyActionData(outcome);
}

/**
 * The document the dialog previewed and the operator confirmed, sent beside the
 * confirmation so the emitter can refuse a plan that moved since. `null` when
 * the form does not name one.
 */
function readConfirmedEmission(formData: FormData): ConfirmedEmission | null {
  const kind = formData.get("kind");
  const amount = Number(formData.get("amount"));

  if (
    !comprobanteKinds.some((known) => known === kind) ||
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return { kind: kind as ConfirmedEmission["kind"], amount };
}

/**
 * Queries ARCA again for the emission left unresolved, without leaving the dialog
 * (#577). Only the attempt's identity — its series and number — is read from
 * the form: the amount and the date the queried comprobante is validated
 * against are recomputed by `recheckAnchorComprobante` from the anchor
 * (ADR-0012 decision 4).
 */
export async function handleRecheckComprobante(
  input: ComprobanteEmissionContext & { formData: FormData },
): Promise<ComprobanteEmissionActionData> {
  const cbteTipo = Number(input.formData.get("cbteTipo"));
  const cbteNro = Number(input.formData.get("cbteNro"));

  if (!isPositiveInteger(cbteTipo) || !isPositiveInteger(cbteNro)) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckAnchorComprobante(
    { anchor: input.anchor, cbteTipo, cbteNro, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  // Recovery by re-verification stays in the dialog: it does not cross a
  // redirect, so it arrives as alert state and not as a toast.
  if (outcome.ok) {
    return { status: "warning", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

/**
 * The detail's emission axis, read off the emitter's own plan: the document the
 * unit owes, or why it owes none in the sentences the emitter would refuse with.
 */
export async function readAnchorInvoicing(input: {
  anchor: ComprobanteAnchor;
  eventId: string;
}): Promise<AnchorInvoicing> {
  const plan = await readAnchorEmissionPlan(input);

  if (plan.ok) {
    return { status: "ready", kind: plan.kind, amount: plan.amount };
  }

  if (!("invoiced" in plan)) {
    return {
      status: "blocked",
      invoiced: false,
      reasons: [{ code: "not-found", label: plan.message }],
      remedy: "Volvé a la lista financiera y elegí otra unidad.",
    };
  }

  return {
    status: "blocked",
    invoiced: plan.invoiced,
    reasons: plan.reasons.map((code) => ({
      code,
      label: emissionRefusalLabel(code),
    })),
    remedy: emissionRemedy(plan.invoiced),
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function redirectToDetail(detailUrl: string, notification?: NotificationKey) {
  return notification
    ? redirectWithFlashNotification(detailUrl, notification)
    : redirect(detailUrl);
}
