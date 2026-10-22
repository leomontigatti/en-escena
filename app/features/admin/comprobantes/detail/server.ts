import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import type { ComprobanteAnchorReading } from "@/lib/comprobantes/anchor-reading";
import type { ComprobanteAssociation } from "@/lib/comprobantes/association";
import {
  readComprobanteRecord,
  type ComprobanteLineDetail,
} from "@/lib/comprobantes/comprobante-record.server";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";

// The comprobante's fiscal snapshot, enriched with its anchor context (the
// anchor's reading, the academy and the event), its derived state, its lines
// and its associated comprobante. It is read-only, like the row: nothing on
// this screen emits or changes anything.
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
  // `null` on a note or an unknown kind: only an invoice has a status.
  status: ComprobanteStatus | null;
  // What the comprobante belongs to, as the detail reads it: one of two units.
  anchor: ComprobanteAnchorReading;
  academyId: string;
  academyName: string;
  eventName: string;
  lines: ComprobanteLineDetail[];
  // The invoice a note amends, or the notes that adjust an invoice.
  association: ComprobanteAssociation | null;
};

export type ComprobanteDetailLoaderData = {
  comprobante: ComprobanteDetail;
};

// Loads a comprobante by id with its anchor context, its derived state, its
// lines and its association. 404 if it does not exist.
export async function loadComprobanteDetail(
  request: Request,
  comprobanteId: string,
): Promise<ComprobanteDetailLoaderData> {
  await requireAdminPanelWriter(request);

  const record = await readComprobanteRecord(comprobanteId);

  if (!record) {
    throw new Response("Comprobante no encontrado", { status: 404 });
  }

  const { comprobante, context } = record;

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
      anchor: context.reading,
      academyId: context.academyId,
      academyName: context.academyName,
      eventName: context.eventName,
      lines: record.lines,
      association: record.association,
    },
  };
}
