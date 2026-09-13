export type SeminarFinanceActionData = { status: "error"; message: string };

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
