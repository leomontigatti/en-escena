import { describe, expect, test } from "vitest";

import { renderComprobanteQrSvg } from "./qr-code.server";
import type { ComprobanteQrInput } from "./qr";

const qrInput: ComprobanteQrInput = {
  cbteFch: "20260722",
  issuerCuit: "30717611590",
  ptoVta: 3,
  cbteTipo: 11,
  cbteNro: 7,
  impTotal: 25000,
  receptorDocTipo: 99,
  receptorDocNro: "0",
  cae: "11112222333344",
};

describe("renderComprobanteQrSvg", () => {
  test("genera un SVG autocontenido del QR de la RG 4291", async () => {
    const svg = await renderComprobanteQrSvg(qrInput);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // El SVG dibuja la matriz del QR con un path relleno.
    expect(svg).toContain("<path");
  });

  test("es determinístico para el mismo comprobante", async () => {
    const first = await renderComprobanteQrSvg(qrInput);
    const second = await renderComprobanteQrSvg(qrInput);

    expect(first).toBe(second);
  });
});
