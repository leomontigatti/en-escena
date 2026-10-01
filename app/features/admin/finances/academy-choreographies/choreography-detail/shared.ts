import type { ComprobanteEmissionActionData } from "@/features/admin/finances/comprobante-emission/shared";

// The detail answers the money dialog, the waiver and the emission dialog with
// one shape, and the emission half is the shared union so both anchors' dialogs
// read the same thing. The waiver stays on the page and toasts its `success`.
export type ChoreographyFinanceActionData =
  ComprobanteEmissionActionData | { status: "success"; message: string };

// The canonical URL of the choreography's financial detail. It is shared by the
// detail's server and the emission axis, which redirects to the same place.
export function choreographyDetailUrl(
  academyId: string,
  choreographyId: string,
  eventId: string,
): string {
  return `/administracion/finanzas/${academyId}/coreografias/${choreographyId}?evento=${eventId}`;
}

// The `Bonificada` waiver of one inscription (ADR-0017). It lives here and not
// with the money gestures: the money dialog is shared with the seminar detail,
// and a seminar inscription has no waiver.
export const waiveInscriptionIntent = "waive-inscription";
export const unwaiveInscriptionIntent = "unwaive-inscription";
// The same waiver over every active inscription of the choreography.
export const waiveChoreographyIntent = "waive-choreography";
export const unwaiveChoreographyIntent = "unwaive-choreography";

export const waiverIntents = [
  waiveInscriptionIntent,
  unwaiveInscriptionIntent,
  waiveChoreographyIntent,
  unwaiveChoreographyIntent,
] as const;

export type WaiverIntent = (typeof waiverIntents)[number];
