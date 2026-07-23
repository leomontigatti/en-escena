import type { ArcaContingency } from "../contingency-alert";

export const annulComprobanteIntent = "annul-comprobante";

// Valor exacto que la confirmación irreversible de anulación manda en el form. La
// anulación emite una Nota de crédito real contra ARCA, así que el server exige
// la misma palabra clave que la UI para que un submit accidental no pase.
export const annulComprobanteConfirmValue = "irreversible";

export type AdminComprobantesListActionData =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | {
      status: "annul-error";
      message: string;
      contingency: ArcaContingency;
    };
