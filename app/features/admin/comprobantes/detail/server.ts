import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, choreographies, comprobantes, events } from "@/db/schema";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import { listChoreographyComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import {
  getFacturaCEmissionDeps,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import {
  annulComprobante,
  recheckComprobanteAnnulment,
} from "@/lib/comprobantes/emit-nota-credito.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  recheckNotaCreditoIntent,
  type ComprobanteDetailActionData,
} from "./shared";

// The comprobante's fiscal snapshot, enriched with its anchor context
// (choreography/academy/event) and its derived state. It is read-only: the row
// is immutable; the only mutable thing from here is annulling it by emitting its
// mirror credit note.
export type ComprobanteDetail = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  caeVto: string;
  fchServDesde: string | null;
  fchServHasta: string | null;
  fchVtoPago: string | null;
  status: ComprobanteStatus;
  choreographyId: string;
  choreographyName: string;
  academyId: string;
  academyName: string;
  eventName: string;
  // Only a comprobante in force can be annulled: a credit note already
  // emitted is not annulled, and an already annulled comprobante is not
  // re-annulled from the UI.
  canAnnul: boolean;
};

export type ComprobanteDetailLoaderData = {
  comprobante: ComprobanteDetail;
};

// Loads a comprobante by id with its anchor context and its derived state. The
// state is derived over the set of its choreography, which is self-contained
// (the mirror credit note anchors to the same choreography). 404 if it does
// not exist.
export async function loadComprobanteDetail(
  request: Request,
  comprobanteId: string,
): Promise<ComprobanteDetailLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);

  const [context] = await db
    .select({
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      academyId: academies.id,
      academyName: academies.name,
      eventName: events.name,
    })
    .from(comprobantes)
    .innerJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .innerJoin(events, eq(comprobantes.eventId, events.id))
    .where(eq(comprobantes.id, comprobanteId));

  if (!context) {
    throw new Response("Comprobante no encontrado", { status: 404 });
  }

  const scope = await listChoreographyComprobantes(context.choreographyId);
  const comprobante = scope.find((row) => row.id === comprobanteId);

  if (!comprobante) {
    throw new Response("Comprobante no encontrado", { status: 404 });
  }

  return {
    comprobante: {
      id: comprobante.id,
      cbteTipo: comprobante.cbteTipo,
      ptoVta: comprobante.ptoVta,
      cbteNro: comprobante.cbteNro,
      cbteFch: comprobante.cbteFch,
      impTotal: comprobante.impTotal,
      cae: comprobante.cae,
      caeVto: comprobante.caeVto,
      fchServDesde: comprobante.fchServDesde,
      fchServHasta: comprobante.fchServHasta,
      fchVtoPago: comprobante.fchVtoPago,
      status: comprobante.status,
      choreographyId: context.choreographyId,
      choreographyName: context.choreographyName,
      academyId: context.academyId,
      academyName: context.academyName,
      eventName: context.eventName,
      canAnnul: comprobante.status === "vigente",
    },
  };
}

export async function handleComprobanteDetailAction(input: {
  request: Request;
  comprobanteId: string;
  // Injectable emission inputs: the tests pass a mocked ARCA client; in
  // production they are resolved from the environment (cert+key, sales point).
  resolveEmissionDeps?: () => FacturaCEmissionDeps;
}): Promise<ComprobanteDetailActionData | never> {
  await requireAdminUser(input.request);

  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === annulComprobanteIntent) {
    return await handleAnnulComprobante({
      comprobanteId: input.comprobanteId,
      confirm: String(formData.get("confirm") ?? ""),
      resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
    });
  }

  if (intent === recheckNotaCreditoIntent) {
    return await handleRecheckNotaCredito({
      comprobanteId: input.comprobanteId,
      cbteNro: String(formData.get("cbteNro") ?? ""),
      resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
    });
  }

  return { status: "error", message: "No pudimos procesar esa acción." };
}

/**
 * Annuls the comprobante by emitting its mirror credit note after the
 * AlertDialog is confirmed. An approved CAE reloads the detail (now annulled); a
 * rejection or contingency from ARCA comes back as `annul-error` with the raw
 * state, without persisting anything or leaving the UI inconsistent (the reload
 * only happens on the happy path).
 */
async function handleAnnulComprobante(input: {
  comprobanteId: string;
  confirm: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ComprobanteDetailActionData | never> {
  if (input.confirm !== annulComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la anulación para continuar.",
    };
  }

  const outcome = await annulComprobante(
    { comprobanteId: input.comprobanteId },
    input.resolveEmissionDeps(),
  );

  const url = `/administracion/comprobantes/${input.comprobanteId}`;

  if (outcome.ok) {
    // A recovered annulment redirects like any other, so the notice travels by
    // flash session (docs/agents/form-feedback.md). It deliberately does not look
    // like the dialog's `recovered`: that way the operator can tell "it recovered
    // on its own" from "I recovered it myself".
    throw outcome.recovered
      ? await redirectWithFlashNotification(url, "comprobante-recuperado")
      : redirect(url);
  }

  return toContingencyActionData(outcome);
}

/**
 * Queries ARCA again for the credit note left unresolved, without leaving
 * the dialog (#577). Only the sequence number is read from the form: the amount
 * and the date the queried comprobante is validated against are recomputed by
 * `recheckComprobanteAnnulment` from the comprobante being annulled (ADR-0012
 * decision 4).
 */
async function handleRecheckNotaCredito(input: {
  comprobanteId: string;
  cbteNro: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ComprobanteDetailActionData> {
  const cbteNro = Number(input.cbteNro);

  if (!Number.isInteger(cbteNro) || cbteNro <= 0) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckComprobanteAnnulment(
    { comprobanteId: input.comprobanteId, cbteNro },
    input.resolveEmissionDeps(),
  );

  // Recovery by re-verification stays in the dialog: it does not cross a
  // redirect, so it arrives as alert state and not as a toast.
  if (outcome.ok) {
    return { status: "contingency", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}
