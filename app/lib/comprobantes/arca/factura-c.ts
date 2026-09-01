import type { ElectronicBillingService } from "@arcasdk/core";

// The SDK does not re-export `IVoucher` from the package root, so we derive its
// shape from `createVoucher`'s parameter (the `FECAESolicitar` payload).
export type ArcaVoucher = Parameters<
  ElectronicBillingService["createVoucher"]
>[0];

// ARCA comprobante constants for the Factura C circuit. Frozen by spec #320 and
// confirmed by spike #428: the issuer is Proyecciones Artísticas Asociación
// Civil (VAT-exempt → class C) and the recipient is an anonymous final
// consumer.
export const FACTURA_C_CBTE_TIPO = 11;
// Nota de crédito C: the mirror comprobante that annuls a Factura C
// (#328/#449). It is built via `buildNotaCreditoCVoucher` (nota-credito.ts),
// reusing the class C base plus the `CbtesAsoc` array.
export const NOTA_CREDITO_C_CBTE_TIPO = 13;
export const DOC_TIPO_CONSUMIDOR_FINAL = 99;
export const DOC_NRO_CONSUMIDOR_FINAL = 0;
// Concepto 2 = Services. An entry to a competition is a service, not a sale of
// goods (ADR-0011): it is billed as a service and the payload carries the
// service period (`FchServDesde`/`FchServHasta`) and the payment due date
// (`FchVtoPago`), as ARCA requires for Concepto 2 (Annex II, RG 1415).
export const CONCEPTO_SERVICIOS = 2;
export const MONEDA_PESOS = "PES";

// ARCA date format `AAAAMMDD`, for both `CbteFch` and `CAEFchVto`.
const ARCA_DATE_RE = /^\d{8}$/;

// Service period and payment due date of a Concepto 2 comprobante, in ARCA's
// `AAAAMMDD` format. The three go together or not at all: a service payload
// carries all three. On emission (#479) `FchServDesde`/`FchServHasta` derive
// from the event's dates and `FchVtoPago` from the comprobante's date; the Nota
// de crédito mirrors all three from the comprobante it annuls. They are
// optional in the builder because the DB-backed emission logic does not wire
// them yet (separate sub-issue).
export type ServiceDates = {
  fchServDesde: string;
  fchServHasta: string;
  fchVtoPago: string;
};

export type FacturaCVoucherInput = {
  ptoVta: number;
  // The comprobante's sequence number. The emission logic (#446) resolves it
  // from `FECompUltimoAutorizado + 1`; the builder does not auto-number, so as
  // not to hide that anti-double-charge decision.
  cbteNro: number;
  cbteFch: string;
  // Total amount in whole Argentine pesos (no cents, see finances.md).
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

// Common base of a class C comprobante to an anonymous final consumer (Factura
// C type 11 and Nota de crédito C type 13). Both share the exempt issuer, the
// final-consumer recipient and the absence of itemized VAT; only `CbteTipo`
// changes and, on the Nota de crédito, the `CbtesAsoc` array with the
// comprobante it annuls (#449).
export type ClassCVoucherBase = {
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  importe: number;
  condicionIvaReceptorId: number;
} & Partial<ServiceDates>;

// Resolves the payload's service-dates block. The three dates go together or
// not at all (a real Concepto 2 carries all three); if they are present, it
// validates their format and WSFEv1's hard constraints: `FchServHasta >=
// FchServDesde` and `FchVtoPago >= CbteFch`. Lexicographic comparison of
// `AAAAMMDD` (fixed width, zero-padded) matches chronological order.
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

// Builds the `FECAESolicitar` payload of a class C comprobante (#320/§3 of
// research #321). `Concepto: 2` (services, ADR-0011): if the input carries the
// service dates, they are emitted in the payload
// (`FchServDesde`/`FchServHasta`/`FchVtoPago`). Without itemized VAT:
// `ImpNeto = ImpTotal`, the remaining amounts at 0, and the `<Iva>` array is NOT
// sent. `CbteHasta = CbteDesde` (validation 10012). `cbtesAsoc`, when present,
// builds the `CbtesAsoc` link.
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

// Builds the `FECAESolicitar` payload of a Factura C (type 11).
export function buildFacturaCVoucher(input: FacturaCVoucherInput): ArcaVoucher {
  return buildClassCVoucher(input, { cbteTipo: FACTURA_C_CBTE_TIPO });
}
