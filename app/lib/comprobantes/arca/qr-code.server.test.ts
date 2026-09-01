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
  test("generates a self-contained SVG of the RG 4291 QR", async () => {
    const svg = await renderComprobanteQrSvg(qrInput);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // The SVG draws the QR's matrix with a filled path.
    expect(svg).toContain("<path");
  });

  test("is deterministic for the same comprobante", async () => {
    const first = await renderComprobanteQrSvg(qrInput);
    const second = await renderComprobanteQrSvg(qrInput);

    expect(first).toBe(second);
  });
});
