import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";

// Intención de anulación del detalle del comprobante (ADR-0011). La anulación
// vive junto al comprobante que afecta, no en la lista global ni en el detalle
// financiero de la coreografía.
export const annulComprobanteIntent = "annul-comprobante";

// Palabra clave de submit deliberado que el server exige antes de disparar la
// anulación: la afordancia de UI y el server acuerdan el mismo valor para que un
// submit accidental no emita una Nota de crédito. Igual que la emisión, no es un
// checkbox: la confirmación es el AlertDialog mismo.
export const annulComprobanteConfirmValue = "nota-credito";

// Re-verificación de una anulación que quedó sin resolver (#577): vuelve a
// consultar a ARCA por esa Nota de crédito, sin reintentar la autorización.
export const recheckNotaCreditoIntent = "recheck-nota-credito";

export type ComprobanteDetailActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };
