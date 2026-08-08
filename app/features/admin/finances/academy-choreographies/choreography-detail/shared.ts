import type { ComprobanteContingency } from "@/lib/comprobantes/contingency-alert";

export const payDepositIntent = "pay-deposit";
export const payBalanceIntent = "pay-balance";
export const emitComprobanteIntent = "emit-comprobante";

// The three money gestures of an inscription. All of them name an inscription
// and an amount and never a payment: which payment the money comes from or goes
// back to is the pool rules' answer.
export const allocateInscriptionIntent = "allocate-inscription";
export const removeInscriptionMoneyIntent = "remove-inscription-money";
export const releaseInscriptionExcessIntent = "release-inscription-excess";

/** How a dancer is named everywhere on the financial detail. */
export function formatDancerName(input: {
  firstName: string;
  lastName: string;
}) {
  return `${input.firstName} ${input.lastName}`;
}

// Re-verificación de una emisión que quedó sin resolver (#577): vuelve a
// consultar a ARCA por ese correlativo, sin reintentar la autorización.
export const recheckComprobanteIntent = "recheck-comprobante";

// Valor exacto que la confirmación irreversible de emisión manda en el form. El
// server lo exige antes de disparar la emisión: la afordancia de UI y el server
// acuerdan la misma palabra clave para que un submit accidental no pase.
export const emitComprobanteConfirmValue = "irreversible";

export type ChoreographyFinanceActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };

// URL canónica del detalle financiero de la coreografía. La comparten el server
// del detalle y el eje de emisión, que redirige al mismo lugar.
export function choreographyDetailUrl(
  academyId: string,
  choreographyId: string,
  eventId: string,
): string {
  return `/administracion/finanzas/${academyId}/coreografias/${choreographyId}?evento=${eventId}`;
}
