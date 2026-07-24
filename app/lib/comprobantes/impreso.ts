import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "./arca/factura-c";

// Datos y leyendas del impreso del comprobante (#329/#334). El emisor es
// Proyecciones Artísticas Asociación Civil, una asociación civil EXENTA frente
// al IVA (#426): NO es monotributista. La leyenda de condición frente al IVA del
// emisor es "IVA Exento" —no "Responsable Monotributo"—, que es la que difiere
// del caso monotributo. El resto del impreso clase C (letra "C", receptor
// consumidor final, sin IVA discriminado) es idéntico.

// Razón social del emisor. El CUIT no se fija acá: se toma del snapshot inmutable
// de cada comprobante (`issuerCuit`), que es lo efectivamente autorizado.
export const EMISOR_RAZON_SOCIAL = "Proyecciones Artísticas Asociación Civil";

// Condición del emisor frente al IVA. Una asociación civil exenta imprime
// "IVA Exento"; ésta es la leyenda que cambia respecto de un monotributista, que
// imprimiría "Responsable Monotributo".
export const EMISOR_CONDICION_IVA_LABEL = "IVA Exento";

// Condición del receptor: consumidor final anónimo (#324).
export const RECEPTOR_CONDICION_IVA_LABEL = "Consumidor Final";

// Leyenda de autorización de ARCA que acompaña al CAE y al QR (RG 4291).
export const COMPROBANTE_AUTORIZADO_LABEL = "Comprobante Autorizado";

// Encabezado del comprobante según su tipo: letra grande, código ARCA a 3
// dígitos y título. Sólo se emiten Factura C (011) y Nota de crédito C (013).
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
