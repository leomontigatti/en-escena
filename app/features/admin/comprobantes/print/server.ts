import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, comprobantes, events } from "@/db/schema";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { renderComprobanteQrSvg } from "@/lib/comprobantes/arca/qr-code.server";
import { listChoreographyComprobantes } from "@/lib/comprobantes/comprobantes.server";

import {
  buildComprobantePrintViewModel,
  type ComprobantePrintRecord,
} from "./model";
import { renderComprobantePrintDocument } from "./view";

// Carga el comprobante con su estado derivado, sus líneas y el contexto que
// ancla (coreografía/academia/evento). Devuelve null si no existe.
async function getComprobantePrintRecord(
  comprobanteId: string,
): Promise<ComprobantePrintRecord | null> {
  const [context] = await db
    .select({
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
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
    return null;
  }

  const scope = await listChoreographyComprobantes(context.choreographyId);
  const comprobante = scope.find((row) => row.id === comprobanteId);

  if (!comprobante) {
    return null;
  }

  return {
    ...comprobante,
    choreographyName: context.choreographyName,
    academyName: context.academyName,
    eventName: context.eventName,
  };
}

// Loader del impreso on-demand: gate de acceso interno, carga del snapshot,
// generación del QR (RG 4291) y render del HTML autocontenido. Devuelve el HTML
// como respuesta directa; no dispara ninguna emisión. 404 si el comprobante no
// existe.
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
