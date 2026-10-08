import QRCode from "qrcode";
import { renderToStaticMarkup } from "react-dom/server";

import { buildVoteCodeUrl } from "@/lib/grand-final/vote-url";
import type { VoteCodeBatchSheet } from "@/lib/grand-final/vote-codes.server";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";

/** Twenty codes to an A4 sheet, four by five, each cut along its dashed edge. */
const codesPerSheet = 20;

/**
 * The QR as a self-contained SVG, with no network and no external asset, fit
 * for printing. Level "M" and a minimal margin, as on the comprobante.
 */
export async function renderVoteCodeQrSvg(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

const printStyles = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #e5e7eb;
    color: #111827;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .toolbar {
    width: 210mm;
    margin: 0 auto;
    padding: 16px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    font-size: 14px;
  }
  .toolbar button {
    font: inherit;
    padding: 8px 16px;
    border: 1px solid #111827;
    background: #111827;
    color: #ffffff;
    border-radius: 6px;
    cursor: pointer;
  }
  .sheet {
    width: 210mm;
    height: 297mm;
    margin: 0 auto 8mm;
    padding: 10mm;
    background: #ffffff;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(5, 1fr);
    overflow: hidden;
    break-after: page;
  }
  .sheet:last-of-type { break-after: auto; }
  .code {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5mm;
    border: 0.2mm dashed #9ca3af;
    margin: -0.1mm;
    text-align: center;
  }
  .code svg { display: block; width: 34mm; height: 34mm; }
  .title { font-size: 10pt; font-weight: 700; margin: 0; }
  .label { font-size: 7pt; color: #4b5563; margin: 0; }
  @media print {
    body { background: none; }
    .sheet { margin: 0; }
    .no-print { display: none !important; }
  }
`;

const printScript = `document.getElementById('print-button')?.addEventListener('click',function(){window.print();});`;

type VoteCodeCell = { label: string; qrSvg: string };

/**
 * The printable sheet of a batch's `voteCode`s: self-contained HTML in A4
 * sheets of twenty, each code its QR, `Gran final` and the batch it belongs
 * to with its place in it, so a box office can tell which print run a loose
 * code came from. `renderQr` turns a vote URL into the QR's SVG.
 */
export async function renderVoteCodeSheet(input: {
  origin: string;
  renderQr: (url: string) => Promise<string>;
  sheet: VoteCodeBatchSheet;
}): Promise<string> {
  const { sheet } = input;
  const cells = await Promise.all(
    sheet.tokens.map(async (token, index): Promise<VoteCodeCell> => ({
      label: `Lote ${sheet.number} · ${index + 1}/${sheet.tokens.length}`,
      qrSvg: await input.renderQr(buildVoteCodeUrl(input.origin, token)),
    })),
  );
  const sheets = Array.from(
    { length: Math.ceil(cells.length / codesPerSheet) },
    (_, index) =>
      cells.slice(index * codesPerSheet, (index + 1) * codesPerSheet),
  );

  return `<!DOCTYPE html>${renderToStaticMarkup(
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <title>{`Códigos QR · Lote ${sheet.number} | Gran final`}</title>
        <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      </head>
      <body>
        <div className="toolbar no-print">
          <span>
            {`Lote ${sheet.number} · ${sheet.tokens.length} códigos QR · emitido el ${formatBusinessDate(sheet.issuedAt)}`}
          </span>
          <button id="print-button" type="button">
            Imprimir
          </button>
        </div>
        {sheets.map((sheetCells, sheetIndex) => (
          <section className="sheet" key={sheetIndex}>
            {sheetCells.map((cell) => (
              <div className="code" key={cell.label}>
                <div dangerouslySetInnerHTML={{ __html: cell.qrSvg }} />
                <p className="title">Gran final</p>
                <p className="label">Escaneá y votá</p>
                <p className="label">{cell.label}</p>
              </div>
            ))}
          </section>
        ))}
        <script dangerouslySetInnerHTML={{ __html: printScript }} />
      </body>
    </html>,
  )}`;
}
