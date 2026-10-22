import { redirect } from "react-router";

import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import type { ComprobanteAnchor } from "@/lib/comprobantes/anchor";
import { describeCbteFchFloor } from "@/lib/comprobantes/cbte-fch";
import {
  emitAnchorComprobante,
  readAnchorEmissionPlan,
  type ComprobanteEmissionDeps,
  type ComprobanteEmissionOutcome,
  type ConfirmedEmission,
} from "@/lib/comprobantes/emit-comprobante.server";
import { formatComprobanteNumber } from "@/lib/comprobantes/format";
import { readConfiguredPtoVta } from "@/lib/comprobantes/emission-config.server";
import {
  abandonComprobanteReservation,
  recheckComprobanteReservation,
} from "@/lib/comprobantes/reserved-attempt.server";
import { comprobanteKinds } from "@/lib/comprobantes/kind";
import {
  emissionRefusalLabel,
  emissionRemedy,
} from "@/lib/comprobantes/emission-plan";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import type { NotificationKey } from "@/lib/shared/notification-toasts";

import type { BulkEmissionActionData } from "./bulk";
import {
  emitComprobanteConfirmValue,
  type AnchorInvoicing,
  type ComprobanteEmissionActionData,
} from "./shared";

/*
 * The financial detail's emission axis: emitting the document the unit owes —
 * its `Factura C`, or the debit or credit note its delta names — and
 * resolving a reservation left live, by re-verifying or abandoning it
 * (ADR-0012, ADR-0014 §5 and §7). It lives apart from the
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
  const emitted = await emitFromForm(input);

  if (!emitted.ok) {
    return emitted.data;
  }

  // A recovered emission redirects like any other, so the notice travels by
  // flash session (docs/agents/form-feedback.md). It deliberately does not look
  // like the dialog's `recovered`: that way the operator can tell "it recovered
  // on its own" from "I recovered it myself".
  throw await redirectToDetail(
    input.detailUrl,
    emitted.outcome.recovered ? "comprobante-recovered" : undefined,
  );
}

/**
 * One emission of a bulk run (#617): the same intent, form and emitter as a
 * detail's, answered in place instead of redirecting, since the run stays on
 * the list and goes on to the next choreography. The list revalidates after
 * each one all the same.
 */
export async function handleBulkEmitComprobante(
  input: Omit<ComprobanteEmissionContext, "detailUrl"> & {
    formData: FormData;
  },
): Promise<BulkEmissionActionData> {
  const emitted = await emitFromForm(input);

  if (!emitted.ok) {
    return emitted.data;
  }

  return {
    status: "success",
    number: formatComprobanteNumber(emitted.outcome.comprobante),
    recovered: emitted.outcome.recovered,
  };
}

// The emission the form confirms, or what the dialog shows instead of it.
async function emitFromForm(
  input: Omit<ComprobanteEmissionContext, "detailUrl"> & {
    formData: FormData;
  },
): Promise<
  | {
      ok: true;
      outcome: Extract<ComprobanteEmissionOutcome, { ok: true }>;
    }
  | { ok: false; data: ComprobanteEmissionActionData }
> {
  if (input.formData.get("confirm") !== emitComprobanteConfirmValue) {
    return {
      ok: false,
      data: {
        status: "error",
        message: "Confirmá la emisión irreversible para continuar.",
      },
    };
  }

  const confirmed = readConfirmedEmission(input.formData);

  if (!confirmed) {
    return {
      ok: false,
      data: {
        status: "error",
        message: "No pudimos identificar el comprobante a emitir.",
      },
    };
  }

  const cbteFch = input.formData.get("cbteFch");
  const outcome = await emitAnchorComprobante(
    {
      anchor: input.anchor,
      eventId: input.eventId,
      confirmed,
      // Absent, the comprobante goes out dated today; present, the emitter
      // checks it against its series before ARCA is asked anything.
      ...(typeof cbteFch === "string" && cbteFch !== "" ? { cbteFch } : {}),
    },
    input.resolveEmissionDeps(),
  );

  return outcome.ok
    ? { ok: true, outcome }
    : { ok: false, data: toContingencyActionData(outcome) };
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
 * Queries ARCA again for a reservation left live, without leaving the dialog
 * (#577). Only the attempt's identity — its series and number — is read from
 * the form; what it is checked against is the reservation's own record of what
 * was submitted, and what it records goes to the anchor the reservation names.
 */
export async function handleRecheckComprobante(
  input: ComprobanteEmissionContext & { formData: FormData },
): Promise<ComprobanteEmissionActionData> {
  const attempt = readAttempt(input.formData);

  if (!attempt) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckComprobanteReservation(
    attempt,
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
 * Gives up a reservation left live, freeing its series (ADR-0014 §7): the
 * `number-taken` one after the operator saw the evidence, the `unverified` one
 * on their word that ARCA's portal does not have it. ARCA may still answer
 * that the number is ours, which records it instead.
 */
export async function handleAbandonReservation(
  input: ComprobanteEmissionContext & { formData: FormData },
): Promise<ComprobanteEmissionActionData> {
  const attempt = readAttempt(input.formData);

  if (!attempt) {
    return {
      status: "error",
      message: "No pudimos identificar el intento a abandonar.",
    };
  }

  const outcome = await abandonComprobanteReservation(
    attempt,
    input.resolveEmissionDeps(),
  );

  if ("released" in outcome) {
    return { status: "warning", contingency: { status: "released" } };
  }

  if (outcome.ok) {
    return { status: "warning", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

function readAttempt(
  formData: FormData,
): { cbteTipo: number; cbteNro: number } | null {
  const cbteTipo = Number(formData.get("cbteTipo"));
  const cbteNro = Number(formData.get("cbteNro"));

  return isPositiveInteger(cbteTipo) && isPositiveInteger(cbteNro)
    ? { cbteTipo, cbteNro }
    : null;
}

/**
 * The detail's emission axis, read off the emitter's own plan: the document the
 * unit owes, or why it owes none in the sentences the emitter would refuse with.
 */
export async function readAnchorInvoicing(input: {
  anchor: ComprobanteAnchor;
  eventId: string;
  ptoVta?: number | null;
}): Promise<AnchorInvoicing> {
  const plan = await readAnchorEmissionPlan({
    ...input,
    ptoVta: input.ptoVta === undefined ? readConfiguredPtoVta() : input.ptoVta,
  });

  if (plan.ok) {
    return {
      status: "ready",
      kind: plan.kind,
      amount: plan.amount,
      cbteFch: {
        today: plan.cbteFch.today,
        floor: plan.cbteFch.floor,
        max: plan.cbteFch.max,
        floorDescription: describeCbteFchFloor(plan.cbteFch),
      },
    };
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
