// The derived state of a `Comprobante` (#320/#326). The state is NOT persisted as
// a column: it is derived from the existence of an associated credit note. A
// factura becomes `anulada` when another comprobante (the credit note, type
// 13) references it via `associatedComprobanteId` (`CbtesAsoc`); if nobody
// references it, it stays `vigente`. In line with the rest of the financial
// model, where the states are derived and not persisted either.

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
