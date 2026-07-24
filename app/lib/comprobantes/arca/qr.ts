// Código QR del comprobante según la RG 4291 de ARCA. El QR codifica una URL
// pública `https://www.afip.gob.ar/fe/qr/?p=<base64>` cuyo parámetro `p` es el
// JSON del comprobante codificado en base64. El contenido es un espejo del
// snapshot fiscal ya emitido (numeración, CUIT emisor, importe, CAE): la vista
// imprimible lo genera bajo demanda y NUNCA dispara una emisión.

// URL base del verificador público de ARCA (RG 4291).
export const AFIP_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/";

// Versión del formato del payload definida por la RG 4291.
export const QR_VERSION = 1;

// Cotización de la moneda: siempre 1 porque se factura en pesos (`PES`).
export const QR_MONEDA_COTIZACION = 1;

// Tipo de código de autorización: "E" = CAE (electrónico). ARCA sólo admite "E"
// para comprobantes electrónicos como la Factura C.
export const QR_TIPO_COD_AUT = "E";

// Datos del comprobante que codifica el QR. Provienen del snapshot inmutable de
// la fila `comprobantes`, así que reproducen exactamente lo autorizado por ARCA.
export type ComprobanteQrInput = {
  // Fecha del comprobante en formato ARCA `AAAAMMDD` (columna `cbteFch`).
  cbteFch: string;
  // CUIT del emisor como texto (30717611590 excede un integer de 32 bits).
  issuerCuit: string;
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
  // Importe total en pesos argentinos enteros (sin centavos, ver finanzas.md).
  impTotal: number;
  receptorDocTipo: number;
  // Documento del receptor como texto (consumidor final anónimo: "0").
  receptorDocNro: string;
  cae: string;
};

// Payload JSON conforme a la RG 4291. El orden y los nombres de los campos son
// los que espera el verificador de ARCA.
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

// Convierte una fecha ARCA `AAAAMMDD` al `AAAA-MM-DD` que exige el QR de la
// RG 4291. Un valor con otra forma se propaga tal cual: el snapshot es inmutable
// y no conviene ocultar un dato inesperado.
function toQrDate(cbteFch: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(cbteFch);

  if (!match) {
    return cbteFch;
  }

  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

// Construye el objeto del payload del QR (RG 4291) a partir del snapshot del
// comprobante. `moneda`/`ctz` son fijos porque se factura en pesos; `tipoCodAut`
// es "E" (CAE). Los identificadores largos (CUIT, CAE) se codifican como número,
// tal como los espera el verificador de ARCA.
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

// Codifica el payload del QR en base64, tal como viaja en el parámetro `p` de la
// URL de la RG 4291.
export function encodeComprobanteQrPayload(data: ComprobanteQrData): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

// URL completa del verificador de ARCA con el payload codificado. Es el texto
// que se representa dentro del código QR del impreso.
export function buildComprobanteQrUrl(input: ComprobanteQrInput): string {
  const payload = encodeComprobanteQrPayload(buildComprobanteQrData(input));
  return `${AFIP_QR_BASE_URL}?p=${payload}`;
}
