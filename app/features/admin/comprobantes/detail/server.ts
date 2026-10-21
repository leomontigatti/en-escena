import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { readComprobanteAnchorContext } from "@/lib/comprobantes/anchor-context.server";
import type { ComprobanteAnchorReading } from "@/lib/comprobantes/anchor-reading";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import { listAnchorComprobantes } from "@/lib/comprobantes/comprobantes.server";

// The comprobante's fiscal snapshot, enriched with its anchor context (the
// anchor's reading, the academy and the event) and its derived state. It is
// read-only, like the row: nothing on this screen emits or changes anything.
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
};

export type ComprobanteDetailLoaderData = {
  comprobante: ComprobanteDetail;
};

// Loads a comprobante by id with its anchor context and its derived state. The
// state is derived over the set of its anchor, which is self-contained: every
// note anchors at its unit's invoice. 404 if it does not exist.
export async function loadComprobanteDetail(
  request: Request,
  comprobanteId: string,
): Promise<ComprobanteDetailLoaderData> {
  await requireAdminPanelWriter(request);

  const context = await readComprobanteAnchorContext(comprobanteId);

  if (!context) {
    throw new Response("Comprobante no encontrado", { status: 404 });
  }

  const scope = await listAnchorComprobantes(context.anchor);
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
      anchor: context.reading,
      academyId: context.academyId,
      academyName: context.academyName,
      eventName: context.eventName,
    },
  };
}
