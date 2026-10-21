import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";
import type { KnownComprobanteKind } from "@/lib/comprobantes/kind";

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
  | { status: "warning"; contingency: ComprobanteContingency };

/**
 * What a financial detail's `Emitir` item offers: the document the unit owes
 * and its amount, or why it owes none. Read off the same plan the emitter
 * follows, so the item and the write cannot disagree; the emitter plans again
 * under its lock all the same.
 */
export type AnchorInvoicing =
  | { status: "ready"; kind: KnownComprobanteKind; amount: number }
  | {
      status: "blocked";
      // Whether the unit already holds its invoice, which decides what the
      // item is called while nothing is owed.
      invoiced: boolean;
      reason: string;
      remedy: string;
    };

/** The menu item's label, naming the document it would emit. */
export function formatEmitActionLabel(invoicing: AnchorInvoicing): string {
  if (invoicing.status === "blocked") {
    return invoicing.invoiced ? "Emitir nota" : "Emitir factura";
  }

  return emitActionLabels[invoicing.kind];
}

const emitActionLabels: Record<KnownComprobanteKind, string> = {
  factura_c: "Emitir factura",
  nota_debito_c: "Emitir nota de débito",
  nota_credito_c: "Emitir nota de crédito",
};
