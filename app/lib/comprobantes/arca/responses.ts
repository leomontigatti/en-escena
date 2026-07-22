import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
} from "@arcasdk/core";

// Mensaje `{Code, Msg}` de ARCA, normalizado a minúsculas. Cubre los tres
// canales que devuelve WSFEv1 con la misma forma: `Errors`, `Observaciones` y
// `Events` (§4.3 de la research #321).
export type ArcaMessage = {
  code: number;
  msg: string;
};

// Los DTO del SDK usan `Code`/`Msg` (WSFEv1) en unos lugares y `code`/`msg` (los
// errores ya mapeados de `FECompUltimoAutorizado`) en otros. Normalizamos ambos.
type RawArcaMessage = {
  Code?: number;
  Msg?: string;
  code?: number;
  msg?: string;
};

function normalizeMessages(raw: RawArcaMessage[] | undefined): ArcaMessage[] {
  if (!raw) {
    return [];
  }

  return raw.map((entry) => ({
    code: entry.Code ?? entry.code ?? 0,
    msg: entry.Msg ?? entry.msg ?? "",
  }));
}

export type FacturaCEmissionResult = {
  // ARCA aprobó el comprobante y devolvió un CAE. Es la única señal de que la
  // Factura C quedó autorizada; un `Resultado` "A" sin CAE no cuenta.
  approved: boolean;
  cae: string | null;
  caeVto: string | null;
  cbteNro: number | null;
  cbteFch: string | null;
  // Resultado de ARCA: "A" aprobado, "R" rechazado, "P" parcial.
  resultado: string | null;
  // No impiden la autorización; el comprobante puede quedar aprobado con ellas.
  observaciones: ArcaMessage[];
  // Impiden la autorización (rechazo).
  errors: ArcaMessage[];
};

// Interpreta la respuesta de `FECAESolicitar`. Superficializa CAE/vencimiento,
// el correlativo autorizado y los errores/observaciones para que la lógica de
// emisión (#446) decida qué persistir sin volver a hurgar el DTO crudo.
export function parseCreateVoucherResult(
  result: CreateVoucherResultDto,
): FacturaCEmissionResult {
  const response = result.response;
  const detail = response.FeDetResp?.FECAEDetResponse?.[0];

  const resultado = detail?.Resultado ?? response.FeCabResp?.Resultado ?? null;
  const cae = detail?.CAE ?? result.cae ?? null;
  const caeVto = detail?.CAEFchVto ?? result.caeFchVto ?? null;

  return {
    approved: resultado === "A" && Boolean(cae),
    cae: cae ? cae : null,
    caeVto: caeVto ? caeVto : null,
    cbteNro: detail?.CbteDesde ?? null,
    cbteFch: detail?.CbteFch ?? null,
    resultado,
    observaciones: normalizeMessages(detail?.Observaciones?.Obs),
    errors: normalizeMessages(response.Errors?.Err),
  };
}

export type LastVoucherResult = {
  // Último comprobante autorizado para el (PtoVta, CbteTipo) consultado. 0 cuando
  // el punto de venta todavía no emitió ninguno.
  lastCbteNro: number;
  // Correlativo siguiente a solicitar (validación 10016: último + 1).
  nextCbteNro: number;
  errors: ArcaMessage[];
};

// Interpreta la respuesta de `FECompUltimoAutorizado`: el último número
// autorizado y el siguiente a pedir.
export function parseLastVoucher(
  result: LastVoucherResultDto,
): LastVoucherResult {
  const lastCbteNro = result.cbteNro ?? 0;

  return {
    lastCbteNro,
    nextCbteNro: lastCbteNro + 1,
    errors: normalizeMessages(result.errors?.err),
  };
}
