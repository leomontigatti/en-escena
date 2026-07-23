import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, comprobantes } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import { formatArcaMessage } from "@/lib/comprobantes/arca/responses";
import {
  deriveComprobanteStatus,
  type ComprobanteStatus,
} from "@/lib/comprobantes/comprobante-status.server";
import {
  getFacturaCEmissionDeps,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { annulComprobante } from "@/lib/comprobantes/emit-nota-credito.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";

import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  type AdminComprobantesListActionData,
} from "./shared";

// Fila de la lista global de comprobantes (#339 variante A). Expone el snapshot
// fiscal ya emitido (numeración, CAE, importe, fecha) junto a su estado derivado
// y la coreografía/academia ancla para navegar al detalle. La anulación es la
// única mutación de esta pantalla (#339, corregido en #474).
export type AdminComprobanteRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  status: ComprobanteStatus;
  // Se puede anular: sólo una Factura C vigente. Una Nota de crédito no se anula
  // (es ella misma la anulación) y una factura ya anulada tampoco.
  canAnnul: boolean;
  choreographyId: string;
  choreographyName: string;
  academyId: string;
  academyName: string;
};

export type AdminComprobanteFacetOption = {
  label: string;
  value: string;
};

export type AdminComprobantesListLoaderData = {
  rows: AdminComprobanteRow[];
  academyFacetOptions: AdminComprobanteFacetOption[];
  selectedEventId: string | null;
};

/**
 * Lista global de comprobantes emitidos en el evento activo. Reúne cada
 * comprobante con su estado derivado (vigente/anulada), CAE y numeración, más la
 * coreografía y academia ancla. NO muta nada: el estado no se persiste, se deriva
 * de la existencia de una Nota de crédito asociada dentro del mismo alcance.
 */
export async function loadAdminComprobantesList(
  request: Request,
): Promise<AdminComprobantesListLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (selectedEventId === null) {
    return {
      rows: [],
      academyFacetOptions: [],
      selectedEventId: null,
    };
  }

  const comprobanteRows = await db
    .select({
      id: comprobantes.id,
      cbteTipo: comprobantes.cbteTipo,
      ptoVta: comprobantes.ptoVta,
      cbteNro: comprobantes.cbteNro,
      cbteFch: comprobantes.cbteFch,
      impTotal: comprobantes.impTotal,
      cae: comprobantes.cae,
      associatedComprobanteId: comprobantes.associatedComprobanteId,
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      academyId: academies.id,
      academyName: academies.name,
    })
    .from(comprobantes)
    .innerJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .where(eq(comprobantes.eventId, selectedEventId))
    .orderBy(desc(comprobantes.createdAt), desc(comprobantes.cbteNro));

  const rows = comprobanteRows.map((row) => {
    const status = deriveComprobanteStatus(row, comprobanteRows);

    return {
      id: row.id,
      cbteTipo: row.cbteTipo,
      ptoVta: row.ptoVta,
      cbteNro: row.cbteNro,
      cbteFch: row.cbteFch,
      impTotal: row.impTotal,
      cae: row.cae,
      status,
      canAnnul: status === "vigente" && row.cbteTipo === FACTURA_C_CBTE_TIPO,
      choreographyId: row.choreographyId,
      choreographyName: row.choreographyName,
      academyId: row.academyId,
      academyName: row.academyName,
    };
  });

  return {
    rows,
    academyFacetOptions: buildAcademyFacetOptions(rows),
    selectedEventId,
  };
}

/**
 * Anulación de un comprobante desde la pantalla de Comprobantes (#339, brecha
 * corregida en #474). Emite la Nota de crédito espejo contra ARCA y **no**
 * redirige: la lista revalida en el lugar y la fila pasa a `Anulada`, según la
 * matriz de feedback (borrar inline desde una lista). Un rechazo o contingencia
 * de ARCA vuelve como `annul-error` con el estado crudo, sin persistir nada.
 */
export async function handleAdminComprobantesListAction(input: {
  request: Request;
  // Insumos de emisión inyectables: los tests pasan un cliente ARCA mockeado;
  // en producción se resuelven desde el entorno (cert+key, punto de venta).
  resolveEmissionDeps?: () => FacturaCEmissionDeps;
}): Promise<AdminComprobantesListActionData> {
  await requireAdminUser(input.request);

  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== annulComprobanteIntent) {
    return { status: "error", message: "No pudimos procesar esa acción." };
  }

  if (String(formData.get("confirm") ?? "") !== annulComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la anulación irreversible para continuar.",
    };
  }

  const comprobanteId = String(formData.get("comprobanteId") ?? "").trim();
  if (!comprobanteId) {
    return { status: "error", message: "Elegí un comprobante para anular." };
  }

  const outcome = await annulComprobante(
    { comprobanteId },
    (input.resolveEmissionDeps ?? getFacturaCEmissionDeps)(),
  );

  if (outcome.ok) {
    return {
      status: "success",
      message: notificationToasts["comprobante-anulado"].message,
    };
  }

  if (outcome.reason === "rejected") {
    return {
      status: "annul-error",
      message: outcome.message,
      contingency: {
        kind: "rejected",
        resultado: outcome.arca?.resultado ?? null,
        errors: (outcome.arca?.errors ?? []).map(formatArcaMessage),
        observaciones: (outcome.arca?.observaciones ?? []).map(
          formatArcaMessage,
        ),
      },
    };
  }

  if (outcome.reason === "unreachable" && outcome.unreachable) {
    return {
      status: "annul-error",
      message: outcome.message,
      contingency: { kind: "unreachable", ...outcome.unreachable },
    };
  }

  return { status: "error", message: outcome.message };
}

// Facetas de academia acotadas a las que efectivamente tienen comprobantes en el
// evento, ordenadas por nombre para una lista estable.
function buildAcademyFacetOptions(
  rows: AdminComprobanteRow[],
): AdminComprobanteFacetOption[] {
  const byName = new Map<string, AdminComprobanteFacetOption>();

  for (const row of rows) {
    if (!byName.has(row.academyName)) {
      byName.set(row.academyName, {
        label: row.academyName,
        value: row.academyName,
      });
    }
  }

  return [...byName.values()].sort((first, second) =>
    first.label.localeCompare(second.label, "es"),
  );
}
