// Estado derivado de un `Comprobante` (#320/#326). El estado NO se persiste como
// columna: se deriva de la existencia de una Nota de crédito asociada. Una
// factura queda `anulada` cuando otro comprobante (la Nota de crédito, tipo 13)
// la referencia vía `associatedComprobanteId` (`CbtesAsoc`); si nadie la
// referencia, sigue `vigente`. En línea con el resto del modelo financiero,
// donde los estados también son derivados y no persistidos.

export type ComprobanteStatus = "vigente" | "anulada";

export function deriveComprobanteStatus(
  comprobante: { id: string },
  comprobantesInScope: ReadonlyArray<{
    associatedComprobanteId: string | null;
  }>,
): ComprobanteStatus {
  const isAnnulled = comprobantesInScope.some(
    (candidate) => candidate.associatedComprobanteId === comprobante.id,
  );

  return isAnnulled ? "anulada" : "vigente";
}
