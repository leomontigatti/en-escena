import QRCode from "qrcode";

import { buildComprobanteQrUrl, type ComprobanteQrInput } from "./qr";

// Renders the RG 4291 QR code as a self-contained SVG (no network and no
// external assets), fit for printing. It encodes the URL of ARCA's verifier with
// the comprobante's payload. Error-correction level "M" and a minimal margin,
// enough for a printout.
export async function renderComprobanteQrSvg(
  input: ComprobanteQrInput,
): Promise<string> {
  const url = buildComprobanteQrUrl(input);
  return await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
