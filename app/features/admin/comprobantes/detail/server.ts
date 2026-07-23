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
import type { ComprobantePorcion } from "@/lib/comprobantes/emit-factura-c.server";
import {
  getFacturaCEmissionDeps,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import type { ArcaMessage } from "@/lib/comprobantes/arca/responses";
import { annulComprobante } from "@/lib/comprobantes/emit-nota-credito.server";

import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
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

  if (outcome.ok) {
    throw redirect(`/administracion/comprobantes/${input.comprobanteId}`);
  }

  if (outcome.reason === "rejected") {
    return {
      status: "annul-error",
      message: outcome.message,
      contingency: {
        resultado: outcome.arca?.resultado ?? null,
        errors: (outcome.arca?.errors ?? []).map(formatArcaMessage),
        observaciones: (outcome.arca?.observaciones ?? []).map(
          formatArcaMessage,
        ),
      },
    };
  }

  return { status: "error", message: outcome.message };
}

function formatArcaMessage(message: ArcaMessage): string {
  return message.code ? `${message.msg} (código ${message.code})` : message.msg;
}
