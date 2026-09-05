import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";

export const emitComprobanteIntent = "emit-comprobante";

// The three money gestures of an inscription. All of them name an inscription
// and an amount and never a payment: which payment the money comes from or goes
// back to is the pool rules' answer.
export const allocateInscriptionIntent = "allocate-inscription";
export const removeInscriptionMoneyIntent = "remove-inscription-money";
export const releaseInscriptionExcessIntent = "release-inscription-excess";

// Re-verification of an emission left unresolved (#577): it queries ARCA again
// for that sequence number, without retrying the authorization.
export const recheckComprobanteIntent = "recheck-comprobante";

// The exact value the irreversible emission confirmation sends in the form. The
// server requires it before triggering the emission: the UI affordance and the
// server agree on the same keyword so an accidental submit does not get through.
export const emitComprobanteConfirmValue = "irreversible";

export type ChoreographyFinanceActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };

// The canonical URL of the choreography's financial detail. It is shared by the
// detail's server and the emission axis, which redirects to the same place.
export function choreographyDetailUrl(
  academyId: string,
  choreographyId: string,
  eventId: string,
): string {
  return `/administracion/finanzas/${academyId}/coreografias/${choreographyId}?evento=${eventId}`;
}
