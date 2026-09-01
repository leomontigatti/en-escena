import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "./arca/factura-c";

// Data and legends for the comprobante printout (#329/#334). The issuer is
// Proyecciones Artísticas Asociación Civil, a civil association EXEMPT from VAT
// (#426): it is NOT a monotributista. The legend for the issuer's VAT condition
// is "IVA Exento" — not "Responsable Monotributo" — and that is what differs
// from the monotributo case. The rest of the class C printout (letter "C",
// final-consumer recipient, no itemized VAT) is identical.

// The issuer's registered name. The CUIT is not fixed here: it is taken from
// each comprobante's immutable snapshot (`issuerCuit`), which is what was
// actually authorized.
export const EMISOR_RAZON_SOCIAL = "Proyecciones Artísticas Asociación Civil";

// The issuer's VAT condition. An exempt civil association prints "IVA Exento";
// this is the legend that differs from a monotributista's, which would print
// "Responsable Monotributo".
export const EMISOR_CONDICION_IVA_LABEL = "IVA Exento";

// The recipient's condition: anonymous final consumer (#324).
export const RECEPTOR_CONDICION_IVA_LABEL = "Consumidor Final";

// ARCA's authorization legend accompanying the CAE and the QR (RG 4291).
export const COMPROBANTE_AUTORIZADO_LABEL = "Comprobante Autorizado";

// The comprobante's header by type: a large letter, a 3-digit ARCA code and a
// title. Only Factura C (011) and Nota de crédito C (013) are emitted.
export type ComprobanteImpresoHeader = {
  letra: string;
  codigo: string;
  titulo: string;
};

export function comprobanteImpresoHeader(
  cbteTipo: number,
): ComprobanteImpresoHeader {
  if (cbteTipo === NOTA_CREDITO_C_CBTE_TIPO) {
    return {
      letra: "C",
      codigo: String(NOTA_CREDITO_C_CBTE_TIPO).padStart(3, "0"),
      titulo: "Nota de Crédito C",
    };
  }

  return {
    letra: "C",
    codigo: String(FACTURA_C_CBTE_TIPO).padStart(3, "0"),
    titulo: "Factura C",
  };
}
