import type { ComprobanteEmissionActionData } from "@/features/admin/finances/comprobante-emission/shared";

// The detail answers the money dialog and the emission dialog with one shape,
// and the emission half is the shared union so both anchors' dialogs read the
// same thing.
export type ChoreographyFinanceActionData = ComprobanteEmissionActionData;

// The canonical URL of the choreography's financial detail. It is shared by the
// detail's server and the emission axis, which redirects to the same place.
export function choreographyDetailUrl(
  academyId: string,
  choreographyId: string,
  eventId: string,
): string {
  return `/administracion/finanzas/${academyId}/coreografias/${choreographyId}?evento=${eventId}`;
}
