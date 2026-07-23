// Intención de anulación del detalle del comprobante (ADR-0011). La anulación
// vive junto al comprobante que afecta, no en la lista global ni en el detalle
// financiero de la coreografía.
export const annulComprobanteIntent = "annul-comprobante";

// Palabra clave de submit deliberado que el server exige antes de disparar la
// anulación: la afordancia de UI y el server acuerdan el mismo valor para que un
// submit accidental no emita una Nota de crédito. Igual que la emisión, no es un
// checkbox: la confirmación es el AlertDialog mismo.
export const annulComprobanteConfirmValue = "nota-credito";

// Estado de contingencia de ARCA superficializado para la UI: el `Resultado`
// crudo y los mensajes de error/observación ya formateados a texto. Se presenta
// cuando WSFEv1 no autoriza la Nota de crédito, sin dejar nada persistido.
export type ComprobanteDetailArcaContingency = {
  resultado: string | null;
  errors: string[];
  observaciones: string[];
};

export type ComprobanteDetailActionData =
  | { status: "error"; message: string }
  | {
      status: "annul-error";
      message: string;
      contingency: ComprobanteDetailArcaContingency;
    };
