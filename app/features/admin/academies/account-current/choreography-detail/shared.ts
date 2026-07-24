export const payDepositIntent = "pay-deposit";
export const payBalanceIntent = "pay-balance";
export const payInscriptionDepositIntent = "pay-inscription-deposit";
export const payInscriptionBalanceIntent = "pay-inscription-balance";
export const deleteAllocationIntent = "delete-allocation";
export const emitComprobanteIntent = "emit-comprobante";

// Valor exacto que la confirmación irreversible de emisión manda en el form. El
// server lo exige antes de disparar la emisión: la afordancia de UI y el server
// acuerdan la misma palabra clave para que un submit accidental no pase.
export const emitComprobanteConfirmValue = "irreversible";

// Estado de contingencia de ARCA superficializado para la UI: el `Resultado`
// crudo y los mensajes de error/observación ya formateados a texto. Se presenta
// cuando WSFEv1 no autoriza el comprobante, sin dejar nada persistido.
export type ArcaContingency = {
  resultado: string | null;
  errors: string[];
  observaciones: string[];
};

export type ChoreographyFinanceActionData =
  | { status: "error"; message: string }
  | {
      status: "emission-error";
      message: string;
      contingency: ArcaContingency;
    };
