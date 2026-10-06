import { renderToStaticMarkup } from "react-dom/server";

// Bundled with the print page rather than linked from a CDN, so the sheet looks
// the same offline and in production. The `?url` import makes Vite emit each
// file and hand back its served address; React Router moves what the server
// build emits into the client assets. Two subsets cover Spanish and the Latin
// names around it; each carries the range `wght.css` gives it, so the browser
// only fetches the one the page's text uses.
import montserratLatinExtUrl from "@fontsource-variable/montserrat/files/montserrat-latin-ext-wght-normal.woff2?url";
import montserratLatinUrl from "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2?url";

import type { ProfessorAccreditation } from "@/lib/admin/professors/professors.server";

/** The designer's artwork, 90×120 mm, used whole as each pass's background. */
const backgroundPath = "/static/images/professor-accreditation-background.svg";

/** Four passes to an A4 sheet, two by two. */
const accreditationsPerSheet = 4;

type ProfessorAccreditationsDocumentProps = {
  accreditations: ProfessorAccreditation[];
  // The already rendered SVG of the QR code to the public program, the same on
  // every pass.
  qrCodeSvg: string;
  qrUrl: string;
};

/**
 * Every length is in millimetres, measured on the artwork: its viewBox is in
 * points (255.12 × 340.16 = 90 × 120 mm, 1 pt = 0.3528 mm). The labels start at
 * x = 25.8 pt (9.1 mm); `ACADEMIA` ends at y = 128.3 pt (45.3 mm), `PROFESOR`
 * starts at y = 174.4 pt (61.5 mm) and ends at y = 194.3 pt (68.5 mm), and the
 * dark panel ends at y = 245.1 pt (86.5 mm). Each name gets the space between
 * its label and the next thing down, less 2 mm either side, and the 72 mm
 * between the side margins.
 *
 * The footer's own lettering ends about 51 mm from the left edge, so a 27 mm
 * tile 4 mm in from the bottom-right corner (59–86 mm across, 89–116 mm down)
 * clears it and stays below the panel.
 *
 * `print-color-adjust: exact` is what prints the artwork and the white tile
 * without the reader turning on "background graphics".
 */
const printStyles = `
  @font-face {
    font-family: "Montserrat Variable";
    font-style: normal;
    font-display: block;
    font-weight: 100 900;
    src: url(${montserratLatinExtUrl}) format("woff2-variations");
    unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
  }
  @font-face {
    font-family: "Montserrat Variable";
    font-style: normal;
    font-display: block;
    font-weight: 100 900;
    src: url(${montserratLatinUrl}) format("woff2-variations");
    unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
  }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #e5e7eb;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .toolbar {
    width: 210mm;
    margin: 0 auto;
    padding: 16px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    color: #111827;
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
    background: #ffffff;
    display: grid;
    grid-template-columns: repeat(2, 90mm);
    grid-template-rows: repeat(2, 120mm);
    gap: 5mm;
    place-content: center;
    overflow: hidden;
    break-after: page;
  }
  .sheet:last-of-type { break-after: auto; }
  .accreditation { position: relative; width: 90mm; height: 120mm; }
  .background {
    position: absolute;
    inset: 0;
    width: 90mm;
    height: 120mm;
    display: block;
  }
  .field {
    position: absolute;
    left: 9.1mm;
    width: 72mm;
  }
  .field.academy { top: 47.3mm; height: 12.2mm; }
  .field.professor { top: 70.5mm; height: 14mm; }
  .fit {
    margin: 0;
    width: 72mm;
    color: #ffffff;
    font-family: "Montserrat Variable", sans-serif;
    font-weight: 700;
    font-size: 14pt;
    line-height: 1.15;
    text-transform: uppercase;
    text-align: left;
    overflow-wrap: normal;
  }
  .qr {
    position: absolute;
    right: 4mm;
    bottom: 4mm;
    width: 27mm;
    height: 27mm;
    padding: 1.5mm;
    background: #ffffff;
    border-radius: 2.5mm;
  }
  .qr svg { display: block; width: 24mm; height: 24mm; }
  .crop { position: absolute; border: 0 solid #000000; }
  .crop.h { width: 3mm; height: 0; border-top-width: 0.2mm; }
  .crop.v { width: 0; height: 3mm; border-left-width: 0.2mm; }
  .crop.top { top: -0.1mm; }
  .crop.bottom { bottom: -0.1mm; }
  .crop.left { left: -0.1mm; }
  .crop.right { right: -0.1mm; }
  .crop.h.left { left: -4mm; }
  .crop.h.right { right: -4mm; }
  .crop.v.top { top: -4mm; }
  .crop.v.bottom { bottom: -4mm; }
  @media print {
    body { background: none; }
    .sheet { margin: 0; }
    .no-print { display: none !important; }
  }
`;

/**
 * Fits each name into at most two lines, shrinking it from 14 pt by quarter
 * points down to 7 pt, and only then lets a word too long for the line break
 * inside itself: a name is never cut. It runs once Montserrat has loaded, since
 * the fallback's widths would fit the wrong text, and needs the browser to
 * measure, which is why it is not done on the server.
 */
const fitScript = `
(function () {
  var maxPt = 14, minPt = 7, stepPt = 0.25, maxLines = 2;
  function overflows(el, sizePt) {
    var lineHeightPx = sizePt * (96 / 72) * 1.15;
    var lines = Math.round(el.scrollHeight / lineHeightPx);
    return lines > maxLines || el.scrollWidth > el.clientWidth + 0.5;
  }
  function fit(el) {
    var size = maxPt;
    el.style.overflowWrap = "normal";
    el.style.fontSize = size + "pt";
    while (size > minPt && overflows(el, size)) {
      size = Math.max(minPt, size - stepPt);
      el.style.fontSize = size + "pt";
    }
    if (overflows(el, size)) el.style.overflowWrap = "anywhere";
  }
  function fitAll() {
    document.querySelectorAll(".fit").forEach(fit);
  }
  document.getElementById("print-button")?.addEventListener("click", function () {
    window.print();
  });
  document.fonts.load('700 14pt "Montserrat Variable"').then(function () {
    return document.fonts.ready;
  }).then(fitAll, fitAll);
})();
`;

/**
 * The printable sheet of professor `accreditation`s: self-contained HTML with
 * its own CSS, in A4 sheets of four 90×120 mm passes with crop marks. Nothing
 * of the printing is recorded.
 */
function ProfessorAccreditationsDocument({
  accreditations,
  qrCodeSvg,
  qrUrl,
}: ProfessorAccreditationsDocumentProps) {
  const sheets = chunkIntoSheets(accreditations);
  const count = accreditations.length;

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Acreditaciones de profesores | En Escena</title>
        <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      </head>
      <body>
        <div className="toolbar no-print">
          <span>
            {count === 0
              ? "No hay profesores para imprimir."
              : `${count} ${count === 1 ? "acreditación" : "acreditaciones"} en ${sheets.length} ${sheets.length === 1 ? "hoja" : "hojas"} A4. Imprimí al 100 %, sin ajustar a la página.`}
          </span>
          {count > 0 ? (
            <button type="button" id="print-button">
              Imprimir
            </button>
          ) : null}
        </div>
        {sheets.map((sheet, sheetIndex) => (
          <section className="sheet" key={sheetIndex}>
            {sheet.map((accreditation) => (
              <article
                className="accreditation"
                data-professor-id={accreditation.id}
                key={accreditation.id}
              >
                <img className="background" src={backgroundPath} alt="" />
                <div className="field academy">
                  <p className="fit">{accreditation.academyName}</p>
                </div>
                <div className="field professor">
                  <p className="fit">
                    {accreditation.firstName} {accreditation.lastName}
                  </p>
                </div>
                <div
                  className="qr"
                  aria-label="Código QR al programa"
                  data-qr-url={qrUrl}
                  dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                />
                <CropMarks />
              </article>
            ))}
          </section>
        ))}
        <script dangerouslySetInnerHTML={{ __html: fitScript }} />
      </body>
    </html>
  );
}

/** Two short hairlines at each corner, out in the gap, to cut along. */
function CropMarks() {
  return (
    <>
      {(["top", "bottom"] as const).flatMap((vertical) =>
        (["left", "right"] as const).flatMap((horizontal) => [
          <span
            aria-hidden="true"
            className={`crop h ${vertical} ${horizontal}`}
            key={`h-${vertical}-${horizontal}`}
          />,
          <span
            aria-hidden="true"
            className={`crop v ${vertical} ${horizontal}`}
            key={`v-${vertical}-${horizontal}`}
          />,
        ]),
      )}
    </>
  );
}

function chunkIntoSheets(accreditations: ProfessorAccreditation[]) {
  const sheets: ProfessorAccreditation[][] = [];

  for (
    let index = 0;
    index < accreditations.length;
    index += accreditationsPerSheet
  ) {
    sheets.push(accreditations.slice(index, index + accreditationsPerSheet));
  }

  return sheets;
}

// Serializes the document to a complete HTML string with its `<!DOCTYPE html>`,
// ready to be served as the loader's response.
export function renderProfessorAccreditationsDocument(
  props: ProfessorAccreditationsDocumentProps,
): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(
    <ProfessorAccreditationsDocument {...props} />,
  )}`;
}
