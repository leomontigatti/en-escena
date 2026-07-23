import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, comprobantes } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  deriveComprobanteStatus,
  type ComprobanteStatus,
} from "@/lib/comprobantes/comprobante-status.server";
import type { ComprobantePorcion } from "@/lib/comprobantes/emit-factura-c.server";

// Fila de la lista global de comprobantes (#339 variante A). Es de sólo lectura:
// expone el snapshot fiscal ya emitido (numeración, CAE, importe, fecha) junto a
// su estado derivado y la coreografía/academia ancla para navegar al detalle.
export type AdminComprobanteRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  porcion: ComprobantePorcion;
  status: ComprobanteStatus;
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
      porcion: comprobantes.porcion,
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

  const rows = comprobanteRows.map((row) => ({
    id: row.id,
    cbteTipo: row.cbteTipo,
    ptoVta: row.ptoVta,
    cbteNro: row.cbteNro,
    cbteFch: row.cbteFch,
    impTotal: row.impTotal,
    cae: row.cae,
    porcion: row.porcion,
    status: deriveComprobanteStatus(row, comprobanteRows),
    choreographyId: row.choreographyId,
    choreographyName: row.choreographyName,
    academyId: row.academyId,
    academyName: row.academyName,
  }));

  return {
    rows,
    academyFacetOptions: buildAcademyFacetOptions(rows),
    selectedEventId,
  };
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
