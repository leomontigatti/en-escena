import { renderToStaticMarkup } from "react-dom/server";

import type { ComprobantePrintViewModel } from "./model";

type ComprobantePrintDocumentProps = {
  model: ComprobantePrintViewModel;
  // The already rendered SVG of the RG 4291 QR code (arca/qr-code.server).
  qrCodeSvg: string;
};

// Minimal self-contained CSS: the printout does not depend on the app's
// stylesheet because it is served as a standalone HTML document. `@media print`
// hides the print button.
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
  .header .letter {
    border: 1px solid #111827;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    font-weight: 700;
  }
  .title { font-size: 20px; font-weight: 700; margin: 0; }
  .code { color: #6b7280; font-size: 12px; }
  .number, .date { margin: 2px 0; }
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
  td.amount, th.amount { text-align: right; }
  .total { text-align: right; font-size: 18px; font-weight: 700; margin-top: 12px; }
  .service { margin-top: 12px; font-size: 13px; color: #374151; }
  .service p { margin: 2px 0; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; gap: 24px; }
  .qr svg { width: 140px; height: 140px; }
  .cae { text-align: right; }
  .status { display: inline-block; padding: 2px 8px; border: 1px solid #111827; border-radius: 999px; font-size: 12px; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .sheet { border: none; }
    .no-print { display: none !important; }
  }
`;

const printScript = `document.getElementById('print-button')?.addEventListener('click',function(){window.print();});`;

// The self-contained HTML document of the comprobante's printable view
// (#329/#334). Every text arrives already formatted in the model. The RG 4291 QR
// is injected as SVG. There is no emission logic: it is a read-only projection
// of the immutable snapshot.
export function ComprobantePrintDocument({
  model,
  qrCodeSvg,
}: ComprobantePrintDocumentProps) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${model.header.title} ${model.number} | En Escena`}</title>
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
              <p className="title">{model.header.title}</p>
              <p className="code">Cód. {model.header.code}</p>
              <p className="number">
                <strong>N°:</strong> {model.number}
              </p>
              <p className="date">
                <strong>Fecha de emisión:</strong> {model.issueDate}
              </p>
              <p className="code">Evento: {model.eventName}</p>
            </div>
            <div className="letter" aria-hidden="true">
              {model.header.letter}
            </div>
          </div>

          <div className="block">
            <h2>Emisor</h2>
            <p>
              <strong>{model.issuerLegalName}</strong>
            </p>
            <p>CUIT: {model.issuerCuit}</p>
            <p>Condición frente al IVA: {model.issuerVatCondition}</p>
          </div>

          <div className="block">
            <h2>Receptor</h2>
            <p>Condición frente al IVA: {model.recipientVatCondition}</p>
            <p>
              {model.academyName} — {model.anchorLabel}
            </p>
          </div>

          <div className="block">
            <h2>Detalle</h2>
            <table>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th className="amount">Importe</th>
                </tr>
              </thead>
              <tbody>
                {model.lines.map((line, index) => (
                  <tr key={index}>
                    <td>{line.description}</td>
                    <td className="amount">{line.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="total">Total: {model.totalAmount}</p>
            {(model.servicePeriodFrom || model.paymentDueDate) && (
              <div className="service">
                {model.servicePeriodFrom && model.servicePeriodTo && (
                  <p>
                    <strong>Período facturado:</strong>{" "}
                    {model.servicePeriodFrom} — {model.servicePeriodTo}
                  </p>
                )}
                {model.paymentDueDate && (
                  <p>
                    <strong>Vencimiento de pago:</strong> {model.paymentDueDate}
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
              <p className="code">{model.authorizedLabel}</p>
            </div>
            <div className="cae">
              <p>
                <strong>CAE N°:</strong> {model.cae}
              </p>
              <p>
                <strong>Vto. CAE:</strong> {model.caeVto}
              </p>
              <p>
                Estado: <span className="status">{model.statusLabel}</span>
              </p>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: printScript }} />
      </body>
    </html>
  );
}

// Serializes the document to a complete HTML string with its `<!DOCTYPE html>`,
// ready to be served as the loader's response.
export function renderComprobantePrintDocument(
  props: ComprobantePrintDocumentProps,
): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(
    <ComprobantePrintDocument {...props} />,
  )}`;
}
