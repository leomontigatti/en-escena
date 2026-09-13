import type { ComprobanteEmissionActionData } from "@/features/admin/finances/comprobante-emission/shared";

// The money gestures and the emission answer the same shape, which is the
// shared emission union: the dialog mounted here is the choreography detail's,
// not a twin of it.
export type SeminarFinanceActionData = ComprobanteEmissionActionData;

/**
 * The canonical URL of a `(seminar, academy)` financial detail. The seminar is
 * nested under the academy because the unit is the pair: the same seminar has a
 * different debt for every academy that registered somebody in it.
 */
export function seminarFinanceDetailUrl(
  academyId: string,
  seminarId: string,
  eventId: string,
): string {
  return `/administracion/finanzas/${academyId}/seminarios/${seminarId}?evento=${eventId}`;
}
