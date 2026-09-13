import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";

/*
 * The emission axis of a financial detail, shared by both anchors. It is one
 * module and not a twin for the same reason the money dialog is: what a
 * choreography and a `(seminar, academy)` unit bill differs, but confirming an
 * irreversible emission and surviving a contingency do not.
 */

export const emitComprobanteIntent = "emit-comprobante";

// Re-verification of an emission left unresolved (#577): it queries ARCA again
// for that sequence number, without retrying the authorization.
export const recheckComprobanteIntent = "recheck-comprobante";

// The exact value the irreversible emission confirmation sends in the form. The
// server requires it before triggering the emission: the UI affordance and the
// server agree on the same keyword so an accidental submit does not get through.
export const emitComprobanteConfirmValue = "irreversible";

// What an emission answers the dialog with. Both details' action data are this
// union, so the dialog reads one shape whichever page it is mounted on.
export type ComprobanteEmissionActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };
