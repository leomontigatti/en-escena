import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { readComprobanteAnchorContext } from "@/lib/comprobantes/anchor-context.server";
import { renderComprobanteQrSvg } from "@/lib/comprobantes/arca/qr-code.server";
import { listAnchorComprobantes } from "@/lib/comprobantes/comprobantes.server";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// Loads the comprobante with its derived state, its lines and the anchoring
// context (the anchor's reading, the academy and the event). Returns null if it
// does not exist.
async function getComprobantePrintRecord(
  comprobanteId: string,
): Promise<ComprobantePrintRecord | null> {
  const context = await readComprobanteAnchorContext(comprobanteId);

  if (!context) {
    return null;
  }

  const scope = await listAnchorComprobantes(context.anchor);
  const comprobante = scope.find((row) => row.id === comprobanteId);

  if (!comprobante) {
    return null;
  }

  return {
    ...comprobante,
    anchor: context.reading,
    academyName: context.academyName,
    eventName: context.eventName,
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
  await requireInternalUser(request, ["admin", "auditor"]);

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
