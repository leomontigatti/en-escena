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

import type { ArcaContingency } from "@/features/admin/comprobantes/contingency-alert";

export type { ArcaContingency };

export type ChoreographyFinanceActionData =
  | { status: "error"; message: string }
  | {
      status: "emission-error";
      message: string;
      contingency: ArcaContingency;
    };
