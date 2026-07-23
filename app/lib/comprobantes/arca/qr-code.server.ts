import QRCode from "qrcode";

import { buildComprobanteQrUrl, type ComprobanteQrInput } from "./qr";

// Renderiza el código QR de la RG 4291 como un SVG autocontenido (sin red ni
// assets externos), apto para imprimir. Codifica la URL del verificador de ARCA
// con el payload del comprobante. Nivel de corrección de errores "M" y un margen
// mínimo, suficientes para un impreso.
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
