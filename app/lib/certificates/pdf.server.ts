import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import PDFDocument from "pdfkit";

import {
  layoutCertificateBody,
  type CertificateWeight,
  type MeasureText,
} from "./body-layout";
import type {
  CertificateFields,
  CertificateTemplate,
} from "./templates.server";

/**
 * The PDF of one or more `certificate`s on one template, a page each, in the
 * order given. The artwork is drawn as vectors in the template's own units,
 * scaled to an A4 page, and the sentence in Montserrat embedded in the file.
 */

// A4 landscape, in points.
const pageWidth = 841.89;

const require = createRequire(import.meta.url);

// The static Montserrat: the variable one the app styles with cannot be
// embedded at a chosen weight.
const fontFiles: Record<CertificateWeight, string> = {
  bold: "montserrat-latin-700-normal.woff",
  regular: "montserrat-latin-500-normal.woff",
};

let fonts: Record<CertificateWeight, Buffer> | undefined;

function readFonts() {
  fonts ??= {
    bold: readFont(fontFiles.bold),
    regular: readFont(fontFiles.regular),
  };

  return fonts;
}

function readFont(file: string) {
  return readFileSync(require.resolve(`@fontsource/montserrat/files/${file}`));
}

export async function renderCertificatesPdf(input: {
  certificates: CertificateFields[];
  template: CertificateTemplate;
  title: string;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { artwork, body } = input.template;
  const scale = pageWidth / artwork.width;
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: { Author: "En Escena", Title: input.title },
    margin: 0,
    size: [pageWidth, artwork.height * scale],
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  const { bold, regular } = readFonts();
  doc.registerFont("bold", bold);
  doc.registerFont("regular", regular);

  const measure: MeasureText = (text, weight, fontSize) =>
    doc.font(weight).fontSize(fontSize).widthOfString(text);

  for (const certificate of input.certificates) {
    doc.addPage();
    doc.save();
    doc.scale(scale);

    for (const element of artwork.elements) {
      if (element.kind === "rect") {
        doc
          .rect(element.x, element.y, element.width, element.height)
          .fill(element.fill);
      } else if (element.kind === "jpeg") {
        // A data URI is embedded once and reused on every page.
        doc.image(element.dataUri, element.x, element.y, {
          height: element.height,
          width: element.width,
        });
      } else {
        doc.save();
        doc.translate(element.translateX, element.translateY);
        doc.path(element.d).fill(element.fill, "even-odd");
        doc.restore();
      }
    }

    const layout = layoutCertificateBody(
      input.template.sentence(certificate),
      body,
      measure,
    );

    doc.fillColor(body.color);
    for (const line of layout.lines) {
      for (const piece of line.pieces) {
        doc.font(piece.weight).fontSize(layout.fontSize);
        // pdfkit sets text from the top of the font's box: centred in the
        // line, it sits where the designer's lines did.
        const boxHeight = doc.currentLineHeight(false);

        doc.text(
          piece.text,
          piece.x,
          line.top + (layout.lineHeight - boxHeight) / 2,
          {
            lineBreak: false,
          },
        );
      }
    }

    doc.restore();
  }

  doc.end();
  await finished;

  return new Uint8Array(Buffer.concat(chunks));
}
