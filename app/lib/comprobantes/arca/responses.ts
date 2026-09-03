import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";

// ARCA's `{Code, Msg}` message, normalized to lowercase. It covers the three
// channels WSFEv1 returns with the same shape: `Errors`, `Observaciones` and
// `Events` (§4.3 of research #321).
export type ArcaMessage = {
  code: number;
  msg: string;
};

// A message from ARCA as it is shown to the operator on a rejection. The code is
// informational: ARCA publishes it in its validation table, so it is useful to
// search for, but not every message carries one.
export function formatArcaMessage(message: ArcaMessage): string {
  return message.code ? `${message.msg} (código ${message.code})` : message.msg;
}

// The SDK's DTOs use `Code`/`Msg` (WSFEv1) in some places and `code`/`msg` (the
// already-mapped errors of `FECompUltimoAutorizado`) in others. We normalize
// both.
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
  // ARCA approved the comprobante and returned a CAE. It is the only signal that
  // the invoice C was authorized; a `Resultado` of "A" without a CAE does not
  // count.
  approved: boolean;
  cae: string | null;
  caeVto: string | null;
  cbteNro: number | null;
  cbteFch: string | null;
  // ARCA `Resultado`: "A" approved, "R" rejected, "P" partial.
  resultado: string | null;
  // They do not prevent authorization; the comprobante can be approved with them.
  observaciones: ArcaMessage[];
  // They prevent authorization (a rejection).
  errors: ArcaMessage[];
};

// Interprets the `FECAESolicitar` response. It surfaces CAE/expiry, the
// authorized sequence number and the errors/observations so the emission logic
// (#446) can decide what to persist without digging through the raw DTO again.
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
  // The last comprobante authorized for the (PtoVta, CbteTipo) queried. 0 when
  // the sales point has not emitted any yet.
  lastCbteNro: number;
  // The next sequence number to request (validation 10016: last + 1).
  nextCbteNro: number;
  errors: ArcaMessage[];
};

// Interprets the `FECompUltimoAutorizado` response: the last authorized number
// and the next one to ask for.
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

export type VoucherInfoResult = {
  // CAE of the queried comprobante (`codAutorizacion`) and its expiry.
  cae: string | null;
  caeVto: string | null;
  // The amount and date ARCA has on record for it: these are what validate that
  // the queried comprobante is the one we tried to emit (ADR-0012 decision 4).
  impTotal: number | null;
  cbteFch: string | null;
};

/**
 * Interprets the `FECompConsultar` response. The SDK returns `null` both when
 * the comprobante does not exist and when ARCA answers with code 602 ("does not
 * exist"), so that `null` is propagated as is: it is the signal that nothing was
 * authorized.
 */
export function parseVoucherInfo(
  result: VoucherInfoResultDto | null,
): VoucherInfoResult | null {
  if (result === null) {
    return null;
  }

  return {
    cae: result.codAutorizacion ? result.codAutorizacion : null,
    caeVto: result.fchVto ? result.fchVto : null,
    impTotal: result.impTotal ?? null,
    cbteFch: result.cbteFch ? result.cbteFch : null,
  };
}
