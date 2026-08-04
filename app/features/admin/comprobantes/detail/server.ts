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
import { toComprobanteContingency } from "@/lib/comprobantes/contingency-view";
import type { ComprobantePorcion } from "@/lib/comprobantes/emit-factura-c.server";
import {
  getFacturaCEmissionDeps,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import {
  annulComprobante,
  recheckComprobanteAnnulment,
  type NotaCreditoEmissionOutcome,
} from "@/lib/comprobantes/emit-nota-credito.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  recheckNotaCreditoIntent,
  type ComprobanteDetailActionData,
} from "./shared";

// Snapshot fiscal del comprobante enriquecido con su contexto ancla
// (coreografía/academia/evento) y su estado derivado. Es de sólo lectura: la
// fila es inmutable; lo único mutable desde acá es anularla emitiendo su Nota de
// crédito espejo.
export type ComprobanteDetail = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  caeVto: string;
  porcion: ComprobantePorcion;
  fchServDesde: string | null;
  fchServHasta: string | null;
  fchVtoPago: string | null;
  status: ComprobanteStatus;
  choreographyId: string;
  choreographyName: string;
  academyId: string;
  academyName: string;
  eventName: string;
  // Sólo un comprobante vigente puede anularse: una Nota de crédito ya emitida no
  // se anula, y un comprobante ya anulado no se re-anula desde la UI.
  canAnnul: boolean;
};

export type ComprobanteDetailLoaderData = {
  comprobante: ComprobanteDetail;
};

// Carga un comprobante por id con su contexto ancla y su estado derivado. El
// estado se deriva sobre el conjunto de su coreografía, que es autocontenido (la
// Nota de crédito espejo se ancla a la misma coreografía). 404 si no existe.
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
      porcion: comprobante.porcion,
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
  // Insumos de emisión inyectables: los tests pasan un cliente ARCA mockeado;
  // en producción se resuelven desde el entorno (cert+key, punto de venta).
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
 * Anula el comprobante emitiendo su Nota de crédito espejo tras la confirmación
 * del AlertDialog. Un CAE aprobado recarga el detalle (ahora anulado); un rechazo
 * o contingencia de ARCA vuelve como `annul-error` con el estado crudo, sin
 * persistir nada ni dejar la UI inconsistente (la recarga sólo ocurre en el
 * camino feliz).
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
    // La anulación recuperada redirige igual que cualquier otra, así que el aviso
    // viaja por flash session (docs/agents/form-feedback.md). Es deliberado que
    // no se parezca al `recovered` del diálogo: así el operador puede distinguir
    // "se recuperó sola" de "la recuperé yo".
    throw outcome.recovered
      ? await redirectWithFlashNotification(url, "comprobante-recuperado")
      : redirect(url);
  }

  return toContingencyActionData(outcome);
}

/**
 * Re-consulta a ARCA por la Nota de crédito que quedó sin resolver, sin salir del
 * diálogo (#577). Del form sólo se lee el correlativo: el importe y la fecha con
 * los que se valida el comprobante consultado los recalcula
 * `recheckComprobanteAnnulment` desde el comprobante que se está anulando
 * (ADR-0012 decisión 4).
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

  // La recuperación por re-verificación se queda en el diálogo: no cruza un
  // redirect, así que llega como estado del alert y no como toast.
  if (outcome.ok) {
    return { status: "contingency", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

function toContingencyActionData(
  outcome: Extract<NotaCreditoEmissionOutcome, { ok: false }>,
): ComprobanteDetailActionData {
  const contingency = toComprobanteContingency(outcome);

  return contingency
    ? { status: "contingency", contingency }
    : { status: "error", message: outcome.message };
}
