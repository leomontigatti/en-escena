import { renderToStaticMarkup } from "react-dom/server";

import type { ComprobantePrintViewModel } from "./model";

type ComprobantePrintDocumentProps = {
  model: ComprobantePrintViewModel;
  // SVG del código QR de la RG 4291 ya renderizado (arca/qr-code.server).
  qrCodeSvg: string;
};

// CSS mínimo autocontenido: el impreso no depende de la hoja de estilos de la
// app porque se sirve como documento HTML suelto. `@media print` oculta el botón
// de impresión.
const printStyles = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
    margin: 0;
    padding: 24px;
    background: #f3f4f6;
  }
  .sheet {
    max-width: 720px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #d1d5db;
    padding: 32px;
  }
  .toolbar { max-width: 720px; margin: 0 auto 16px; text-align: right; }
  .toolbar button {
    font: inherit;
    padding: 8px 16px;
    border: 1px solid #111827;
    background: #111827;
    color: #ffffff;
    border-radius: 6px;
    cursor: pointer;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .header .letra {
    border: 1px solid #111827;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    font-weight: 700;
  }
  .titulo { font-size: 20px; font-weight: 700; margin: 0; }
  .codigo { color: #6b7280; font-size: 12px; }
  .numero, .fecha { margin: 2px 0; }
  .block { margin-top: 24px; }
  .block h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin: 0 0 6px;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; }
  td.importe, th.importe { text-align: right; }
  .total { text-align: right; font-size: 18px; font-weight: 700; margin-top: 12px; }
  .servicio { margin-top: 12px; font-size: 13px; color: #374151; }
  .servicio p { margin: 2px 0; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; gap: 24px; }
  .qr svg { width: 140px; height: 140px; }
  .cae { text-align: right; }
  .estado { display: inline-block; padding: 2px 8px; border: 1px solid #111827; border-radius: 999px; font-size: 12px; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .sheet { border: none; }
    .no-print { display: none !important; }
  }
`;

const printScript = `document.getElementById('print-button')?.addEventListener('click',function(){window.print();});`;

// Documento HTML autocontenido de la vista imprimible del comprobante
// (#329/#334). Todos los textos vienen ya formateados en el modelo. El QR de la
// RG 4291 se inyecta como SVG. No hay lógica de emisión: es una proyección de
// sólo lectura del snapshot inmutable.
export function ComprobantePrintDocument({
  model,
  qrCodeSvg,
}: ComprobantePrintDocumentProps) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${model.header.titulo} ${model.numero} | En Escena`}</title>
        <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      </head>
      <body>
        <div className="toolbar no-print">
          <button type="button" id="print-button">
            Imprimir
          </button>
        </div>
        <div className="sheet">
          <div className="header">
            <div>
              <p className="titulo">{model.header.titulo}</p>
              <p className="codigo">Cód. {model.header.codigo}</p>
              <p className="numero">
                <strong>N°:</strong> {model.numero}
              </p>
              <p className="fecha">
                <strong>Fecha de emisión:</strong> {model.fechaEmision}
              </p>
              <p className="codigo">Evento: {model.eventName}</p>
            </div>
            <div className="letra" aria-hidden="true">
              {model.header.letra}
            </div>
          </div>

          <div className="block">
            <h2>Emisor</h2>
            <p>
              <strong>{model.emisorRazonSocial}</strong>
            </p>
            <p>CUIT: {model.emisorCuit}</p>
            <p>Condición frente al IVA: {model.emisorCondicionIva}</p>
          </div>

          <div className="block">
            <h2>Receptor</h2>
            <p>Condición frente al IVA: {model.receptorCondicionIva}</p>
            <p>
              {model.academyName} — {model.choreographyName}
            </p>
          </div>

          <div className="block">
            <h2>Detalle</h2>
            <table>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th className="importe">Importe</th>
                </tr>
              </thead>
              <tbody>
                {model.lines.map((line, index) => (
                  <tr key={index}>
                    <td>{line.descripcion}</td>
                    <td className="importe">{line.importe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="total">Total: {model.importeTotal}</p>
            {(model.periodoDesde || model.vencimientoPago) && (
              <div className="servicio">
                {model.periodoDesde && model.periodoHasta && (
                  <p>
                    <strong>Período facturado:</strong> {model.periodoDesde} —{" "}
                    {model.periodoHasta}
                  </p>
                )}
                {model.vencimientoPago && (
                  <p>
                    <strong>Vencimiento de pago:</strong>{" "}
                    {model.vencimientoPago}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="footer">
            <div className="qr">
              <span
                aria-label="Código QR de verificación ARCA"
                data-qr-url={model.qrUrl}
                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
              />
              <p className="codigo">{model.comprobanteAutorizadoLabel}</p>
            </div>
            <div className="cae">
              <p>
                <strong>CAE N°:</strong> {model.cae}
              </p>
              <p>
                <strong>Vto. CAE:</strong> {model.caeVto}
              </p>
              <p>
                Estado: <span className="estado">{model.estadoLabel}</span>
              </p>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: printScript }} />
      </body>
    </html>
  );
}

// Serializa el documento a un string HTML completo con su `<!DOCTYPE html>`,
// listo para servirse como respuesta del loader.
export function renderComprobantePrintDocument(
  props: ComprobantePrintDocumentProps,
): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(
    <ComprobantePrintDocument {...props} />,
  )}`;
}
