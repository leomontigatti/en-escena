import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";

// The annulment intent of the comprobante detail (ADR-0011). Annulment lives
// next to the comprobante it affects, not in the global list or in the
// choreography's financial detail.
export const annulComprobanteIntent = "annul-comprobante";

// The deliberate-submit keyword the server requires before triggering the
// annulment: the UI affordance and the server agree on the same value so an
// accidental submit cannot emit a Nota de crédito. As with emission, it is not a
// checkbox: the confirmation is the AlertDialog itself.
export const annulComprobanteConfirmValue = "nota-credito";

// Re-verification of an annulment left unresolved (#577): it queries ARCA again
// for that Nota de crédito, without retrying the authorization.
export const recheckNotaCreditoIntent = "recheck-nota-credito";

export type ComprobanteDetailActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };
