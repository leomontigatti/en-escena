// The comprobante's QR code per ARCA's RG 4291. The QR encodes a public URL
// `https://www.afip.gob.ar/fe/qr/?p=<base64>` whose `p` parameter is the
// comprobante's JSON encoded in base64. The content mirrors the already emitted
// fiscal snapshot (numbering, issuer CUIT, amount, CAE): the printable view
// generates it on demand and NEVER triggers an emission.

// Base URL of ARCA's public verifier (RG 4291).
export const AFIP_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/";

// Payload format version defined by RG 4291.
export const QR_VERSION = 1;

// Currency exchange rate: always 1, because billing is in pesos (`PES`).
export const QR_MONEDA_COTIZACION = 1;

// Authorization code type: "E" = CAE (electronic). ARCA admits only "E" for
// electronic comprobantes such as the invoice C.
export const QR_TIPO_COD_AUT = "E";

// The comprobante data the QR encodes. It comes from the immutable snapshot on
// the `comprobantes` row, so it reproduces exactly what ARCA authorized.
export type ComprobanteQrInput = {
  // Comprobante date in ARCA's `AAAAMMDD` format (the `cbteFch` column).
  cbteFch: string;
  // Issuer CUIT as text (30717611590 exceeds a 32-bit integer).
  issuerCuit: string;
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  // Total amount in whole Argentine pesos (no cents, see finances.md).
  impTotal: number;
  receptorDocTipo: number;
  // The recipient's document as text (anonymous final consumer: "0").
  receptorDocNro: string;
  cae: string;
};

// JSON payload conforming to RG 4291. The field order and names are the ones
// ARCA's verifier expects.
export type ComprobanteQrData = {
  ver: number;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: string;
  codAut: number;
};

// Converts an ARCA `AAAAMMDD` date to the `AAAA-MM-DD` RG 4291's QR requires. A
// value with any other shape is propagated as is: the snapshot is immutable and
// hiding unexpected data is not worth it.
function toQrDate(cbteFch: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(cbteFch);

  if (!match) {
    return cbteFch;
  }

  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

// Builds the QR payload object (RG 4291) from the comprobante's snapshot.
// `moneda`/`ctz` are fixed because billing is in pesos; `tipoCodAut` is "E"
// (CAE). The long identifiers (CUIT, CAE) are encoded as numbers, exactly as
// ARCA's verifier expects them.
export function buildComprobanteQrData(
  input: ComprobanteQrInput,
): ComprobanteQrData {
  return {
    ver: QR_VERSION,
    fecha: toQrDate(input.cbteFch),
    cuit: Number(input.issuerCuit),
    ptoVta: input.ptoVta,
    tipoCmp: input.cbteTipo,
    nroCmp: input.cbteNro,
    importe: input.impTotal,
    moneda: "PES",
    ctz: QR_MONEDA_COTIZACION,
    tipoDocRec: input.receptorDocTipo,
    nroDocRec: Number(input.receptorDocNro),
    tipoCodAut: QR_TIPO_COD_AUT,
    codAut: Number(input.cae),
  };
}

// Encodes the QR payload in base64, exactly as it travels in the `p` parameter
// of the RG 4291 URL.
export function encodeComprobanteQrPayload(data: ComprobanteQrData): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

// The full URL of ARCA's verifier with the encoded payload. It is the text
// represented inside the QR code on the printout.
export function buildComprobanteQrUrl(input: ComprobanteQrInput): string {
  const payload = encodeComprobanteQrPayload(buildComprobanteQrData(input));
  return `${AFIP_QR_BASE_URL}?p=${payload}`;
}
