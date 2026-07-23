import { describe, expect, test } from "vitest";

import {
  AFIP_QR_BASE_URL,
  buildComprobanteQrData,
  buildComprobanteQrUrl,
  encodeComprobanteQrPayload,
  type ComprobanteQrInput,
} from "./qr";

function qrInput(
  overrides: Partial<ComprobanteQrInput> = {},
): ComprobanteQrInput {
  return {
    cbteFch: "20260722",
    issuerCuit: "30717611590",
    ptoVta: 3,
    cbteTipo: 11,
    cbteNro: 7,
    impTotal: 25000,
    receptorDocTipo: 99,
    receptorDocNro: "0",
    cae: "11112222333344",
    ...overrides,
  };
}

// Decodifica el parámetro `p` de una URL de QR de la RG 4291 a su objeto JSON.
function decodeQrPayload(url: string): unknown {
  const param = new URL(url).searchParams.get("p");
  expect(param).not.toBeNull();
  return JSON.parse(Buffer.from(param as string, "base64").toString("utf8"));
}

describe("buildComprobanteQrData", () => {
  test("mapea el snapshot del comprobante al payload de la RG 4291", () => {
    expect(buildComprobanteQrData(qrInput())).toEqual({
      ver: 1,
      fecha: "2026-07-22",
      cuit: 30717611590,
      ptoVta: 3,
      tipoCmp: 11,
      nroCmp: 7,
      importe: 25000,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: "E",
      codAut: 11112222333344,
    });
  });

  test("convierte la fecha ARCA AAAAMMDD al AAAA-MM-DD del QR", () => {
    expect(buildComprobanteQrData(qrInput({ cbteFch: "20251231" })).fecha).toBe(
      "2025-12-31",
    );
  });

  test("refleja el tipo de comprobante de una nota de crédito", () => {
    expect(buildComprobanteQrData(qrInput({ cbteTipo: 13 })).tipoCmp).toBe(13);
  });
});

describe("buildComprobanteQrUrl", () => {
  test("arma la URL del verificador de ARCA con el payload en base64", () => {
    const url = buildComprobanteQrUrl(qrInput());

    expect(url.startsWith(`${AFIP_QR_BASE_URL}?p=`)).toBe(true);
    expect(decodeQrPayload(url)).toEqual(buildComprobanteQrData(qrInput()));
  });

  test("el payload codificado es reversible", () => {
    const data = buildComprobanteQrData(qrInput());
    const encoded = encodeComprobanteQrPayload(data);

    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual(
      data,
    );
  });
});
