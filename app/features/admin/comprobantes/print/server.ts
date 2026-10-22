import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { renderComprobanteQrSvg } from "@/lib/comprobantes/arca/qr-code.server";
import { readComprobanteRecord } from "@/lib/comprobantes/comprobante-record.server";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// Loads the comprobante with its lines, its association and the anchoring
// context (the anchor's reading, the academy and the event). Returns null if it
// does not exist.
async function getComprobantePrintRecord(
  comprobanteId: string,
): Promise<ComprobantePrintRecord | null> {
  const record = await readComprobanteRecord(comprobanteId);

  if (!record) {
    return null;
  }

  return {
    ...record.comprobante,
    lines: record.lines,
    association: record.association,
    anchor: record.context.reading,
    academyName: record.context.academyName,
    eventName: record.context.eventName,
  };
}

// Loader for the on-demand printout: internal access gate, snapshot load, QR
// generation (RG 4291) and rendering of the self-contained HTML. It returns the
// HTML as a direct response; it triggers no emission. 404 if the comprobante does
// not exist.
export async function loadComprobantePrint(
  request: Request,
  comprobanteId: string,
): Promise<Response> {
  await requireAdminPanelWriter(request);

  const record = await getComprobantePrintRecord(comprobanteId);

  if (!record) {
    throw new Response("Comprobante no encontrado", { status: 404 });
  }

  const model = buildComprobantePrintViewModel(record);
  const qrCodeSvg = await renderComprobanteQrSvg(record);
  const html = renderComprobantePrintDocument({ model, qrCodeSvg });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
