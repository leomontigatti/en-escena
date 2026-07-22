import type { ElectronicBillingService } from "@arcasdk/core";

// El SDK no re-exporta `IVoucher` desde la raíz del paquete, así que derivamos su
// forma del parámetro de `createVoucher` (el payload `FECAESolicitar`).
export type ArcaVoucher = Parameters<
  ElectronicBillingService["createVoucher"]
>[0];

// Constantes del comprobante ARCA para el circuito de Factura C. Congeladas por
// la spec #320 y confirmadas por el spike #428: el emisor es Proyecciones
// Artísticas Asociación Civil (exenta → clase C) y el receptor es consumidor
// final anónimo.
export const FACTURA_C_CBTE_TIPO = 11;
// Nota de crédito C. No se construye acá (es #449); se expone para que la lógica
// de emisión distinga los tipos al derivar el estado.
export const NOTA_CREDITO_C_CBTE_TIPO = 13;
export const DOC_TIPO_CONSUMIDOR_FINAL = 99;
export const DOC_NRO_CONSUMIDOR_FINAL = 0;
export const CONCEPTO_PRODUCTOS = 1;
export const MONEDA_PESOS = "PES";

// Formato de fecha ARCA `AAAAMMDD`, tanto para `CbteFch` como para `CAEFchVto`.
const ARCA_DATE_RE = /^\d{8}$/;

export type FacturaCVoucherInput = {
  ptoVta: number;
  // Correlativo del comprobante. Lo resuelve la lógica de emisión (#446) a partir
  // de `FECompUltimoAutorizado + 1`; el builder no auto-numera para no esconder
  // esa decisión anti-doble-cobro.
  cbteNro: number;
  cbteFch: string;
  // Importe total en pesos argentinos enteros (sin centavos, ver finanzas.md).
  importe: number;
  condicionIvaReceptorId: number;
};

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} debe ser un entero positivo (recibí ${value}).`);
  }
}

// Construye el payload `FECAESolicitar` de una Factura C (#320/§3 de la research
// #321). Sin IVA discriminado: `ImpNeto = ImpTotal`, el resto de los importes en
// 0, y NO se envía el array `<Iva>`. `CbteHasta = CbteDesde` (validación 10012).
export function buildFacturaCVoucher(input: FacturaCVoucherInput): ArcaVoucher {
  assertPositiveInteger(input.ptoVta, "PtoVta");
  assertPositiveInteger(input.cbteNro, "CbteNro");
  assertPositiveInteger(input.importe, "ImpTotal");
  assertPositiveInteger(input.condicionIvaReceptorId, "CondicionIVAReceptorId");

  if (!ARCA_DATE_RE.test(input.cbteFch)) {
    throw new Error(
      `CbteFch debe tener formato ARCA AAAAMMDD (recibí "${input.cbteFch}").`,
    );
  }

  return {
    CantReg: 1,
    PtoVta: input.ptoVta,
    CbteTipo: FACTURA_C_CBTE_TIPO,
    Concepto: CONCEPTO_PRODUCTOS,
    DocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
    DocNro: DOC_NRO_CONSUMIDOR_FINAL,
    CbteDesde: input.cbteNro,
    CbteHasta: input.cbteNro,
    CbteFch: input.cbteFch,
    ImpTotal: input.importe,
    ImpTotConc: 0,
    ImpNeto: input.importe,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: MONEDA_PESOS,
    MonCotiz: 1,
    CondicionIVAReceptorId: input.condicionIvaReceptorId,
  };
}
