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
// Nota de crédito C: el comprobante espejo que anula una Factura C (#328/#449).
// Se construye vía `buildNotaCreditoCVoucher` (nota-credito.ts) reutilizando la
// base clase C más el array `CbtesAsoc`.
export const NOTA_CREDITO_C_CBTE_TIPO = 13;
export const DOC_TIPO_CONSUMIDOR_FINAL = 99;
export const DOC_NRO_CONSUMIDOR_FINAL = 0;
// Concepto 2 = Servicios. Una inscripción a un certamen es una prestación, no una
// venta de cosa mueble (ADR-0011): se factura como servicio y el payload lleva el
// período de servicio (`FchServDesde`/`FchServHasta`) y el vencimiento de pago
// (`FchVtoPago`), como exige ARCA para Concepto 2 (Anexo II, RG 1415).
export const CONCEPTO_SERVICIOS = 2;
export const MONEDA_PESOS = "PES";

// Formato de fecha ARCA `AAAAMMDD`, tanto para `CbteFch` como para `CAEFchVto`.
const ARCA_DATE_RE = /^\d{8}$/;

// Período de servicio y vencimiento de pago de un comprobante Concepto 2, en
// formato ARCA `AAAAMMDD`. Las tres van juntas o ninguna: un payload de servicio
// las lleva las tres. En la emisión (#479) `FchServDesde`/`FchServHasta` derivan
// de las fechas del evento y `FchVtoPago` de la fecha del comprobante; la Nota de
// crédito espeja las tres del comprobante que anula. Son opcionales en el builder
// porque la lógica de emisión sobre DB todavía no las cablea (sub-issue aparte).
export type ServiceDates = {
  fchServDesde: string;
  fchServHasta: string;
  fchVtoPago: string;
};

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
} & Partial<ServiceDates>;

export function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} debe ser un entero positivo (recibí ${value}).`);
  }
}

export function assertArcaDate(value: string, field = "CbteFch"): void {
  if (!ARCA_DATE_RE.test(value)) {
    throw new Error(
      `${field} debe tener formato ARCA AAAAMMDD (recibí "${value}").`,
    );
  }
}

// Base común de un comprobante clase C a consumidor final anónimo (Factura C
// tipo 11 y Nota de crédito C tipo 13). Ambos comparten emisor exento, receptor
// consumidor final y la ausencia de IVA discriminado; sólo cambian `CbteTipo` y,
// en la Nota de crédito, el array `CbtesAsoc` con el comprobante que anula (#449).
export type ClassCVoucherBase = {
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  importe: number;
  condicionIvaReceptorId: number;
} & Partial<ServiceDates>;

// Resuelve el bloque de fechas de servicio del payload. Las tres fechas van
// juntas o ninguna (un Concepto 2 real las lleva las tres); si vienen, valida su
// formato y las restricciones duras de WSFEv1: `FchServHasta >= FchServDesde` y
// `FchVtoPago >= CbteFch`. La comparación lexicográfica de `AAAAMMDD` (ancho fijo,
// con ceros a la izquierda) coincide con el orden cronológico.
function buildServiceDates(
  input: ClassCVoucherBase,
): Pick<ArcaVoucher, "FchServDesde" | "FchServHasta" | "FchVtoPago"> {
  const { fchServDesde, fchServHasta, fchVtoPago } = input;
  const present = [fchServDesde, fchServHasta, fchVtoPago].filter(
    (value) => value !== undefined,
  );

  if (present.length === 0) {
    return {};
  }

  if (present.length !== 3) {
    throw new Error(
      "Las fechas de servicio (FchServDesde, FchServHasta, FchVtoPago) van " +
        "las tres juntas o ninguna.",
    );
  }

  assertArcaDate(fchServDesde!, "FchServDesde");
  assertArcaDate(fchServHasta!, "FchServHasta");
  assertArcaDate(fchVtoPago!, "FchVtoPago");

  if (fchServHasta! < fchServDesde!) {
    throw new Error(
      `FchServHasta (${fchServHasta}) debe ser >= FchServDesde ` +
        `(${fchServDesde}).`,
    );
  }

  if (fchVtoPago! < input.cbteFch) {
    throw new Error(
      `FchVtoPago (${fchVtoPago}) debe ser >= CbteFch (${input.cbteFch}).`,
    );
  }

  return {
    FchServDesde: fchServDesde,
    FchServHasta: fchServHasta,
    FchVtoPago: fchVtoPago,
  };
}

// Construye el payload `FECAESolicitar` de un comprobante clase C (#320/§3 de la
// research #321). `Concepto: 2` (servicios, ADR-0011): si el input trae las
// fechas de servicio, se emiten en el payload (`FchServDesde`/`FchServHasta`/
// `FchVtoPago`). Sin IVA discriminado: `ImpNeto = ImpTotal`, el resto de los
// importes en 0, y NO se envía el array `<Iva>`. `CbteHasta = CbteDesde`
// (validación 10012). `cbtesAsoc`, si viene, arma el vínculo `CbtesAsoc`.
export function buildClassCVoucher(
  input: ClassCVoucherBase,
  extras: { cbteTipo: number; cbtesAsoc?: ArcaVoucher["CbtesAsoc"] },
): ArcaVoucher {
  assertPositiveInteger(input.ptoVta, "PtoVta");
  assertPositiveInteger(input.cbteNro, "CbteNro");
  assertPositiveInteger(input.importe, "ImpTotal");
  assertPositiveInteger(input.condicionIvaReceptorId, "CondicionIVAReceptorId");
  assertArcaDate(input.cbteFch);

  const serviceDates = buildServiceDates(input);

  return {
    CantReg: 1,
    PtoVta: input.ptoVta,
    CbteTipo: extras.cbteTipo,
    Concepto: CONCEPTO_SERVICIOS,
    ...serviceDates,
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
    ...(extras.cbtesAsoc ? { CbtesAsoc: extras.cbtesAsoc } : {}),
  };
}

// Construye el payload `FECAESolicitar` de una Factura C (tipo 11).
export function buildFacturaCVoucher(input: FacturaCVoucherInput): ArcaVoucher {
  return buildClassCVoucher(input, { cbteTipo: FACTURA_C_CBTE_TIPO });
}
