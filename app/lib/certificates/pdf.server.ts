import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import PDFDocument from "pdfkit";

import type { CertificateArtwork } from "./artwork";
import {
  layoutCertificateBody,
  type CertificateBodyLayout,
  type CertificateWeight,
  type MeasureText,
} from "./body-layout";
import {
  readFontSubsets,
  splitByFontSubset,
  type FontSubset,
} from "./font-subsets";
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
// embedded at a chosen weight. Each weight comes as one file per subset, and a
// piece of text is drawn in the subset that covers it (`font-subsets.ts`).
const fontWeights: Record<CertificateWeight, number> = {
  bold: 700,
  regular: 500,
};

let fonts: { files: Map<string, Buffer>; subsets: FontSubset[] } | undefined;

function readFonts() {
  if (!fonts) {
    const subsets = readFontSubsets(
      require("@fontsource/montserrat/unicode.json") as Record<string, string>,
    );
    const files = new Map<string, Buffer>();

    for (const [weight, number] of Object.entries(fontWeights)) {
      for (const subset of subsets) {
        files.set(
          fontName(weight as CertificateWeight, subset.name),
          readFileSync(
            require.resolve(
              `@fontsource/montserrat/files/montserrat-${subset.name}-${number}-normal.woff`,
            ),
          ),
        );
      }
    }

    fonts = { files, subsets };
  }

  return fonts;
}

function fontName(weight: CertificateWeight, subset: string) {
  return `${weight}-${subset}`;
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
  const text = new SubsetText(doc);

  for (const certificate of input.certificates) {
    doc.addPage();
    doc.save();
    doc.scale(scale);
    drawArtwork(doc, artwork);
    drawSentence(
      text,
      layoutCertificateBody(
        input.template.sentence(certificate),
        body,
        text.measure,
      ),
      body.color,
    );
    doc.restore();
  }

  doc.end();
  await finished;

  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Text in Montserrat, each piece in the subset file that covers it: what the
 * layout measures with and what the page is set with.
 */
class SubsetText {
  private readonly subsets: FontSubset[];

  constructor(readonly doc: PDFKit.PDFDocument) {
    const fonts = readFonts();

    // Registered, not embedded: a PDF carries only the fonts it draws with.
    for (const [name, file] of fonts.files) {
      doc.registerFont(name, file);
    }
    this.subsets = fonts.subsets;
  }

  pieces(text: string, weight: CertificateWeight) {
    return splitByFontSubset(text, this.subsets).map((piece) => ({
      font: fontName(weight, piece.subset),
      text: piece.text,
    }));
  }

  measure: MeasureText = (text, weight, fontSize) =>
    this.pieces(text, weight).reduce(
      (width, piece) =>
        width +
        this.doc.font(piece.font).fontSize(fontSize).widthOfString(piece.text),
      0,
    );
}

function drawArtwork(doc: PDFKit.PDFDocument, artwork: CertificateArtwork) {
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
}

function drawSentence(
  text: SubsetText,
  layout: CertificateBodyLayout,
  color: string,
) {
  const { doc } = text;

  doc.fillColor(color);
  // pdfkit sets text from the top of the font's box: centred in the line, it
  // sits where the designer's lines did. Every subset shares the metrics.
  const boxHeight = doc
    .font(fontName("regular", "latin"))
    .fontSize(layout.fontSize)
    .currentLineHeight(false);
  const offset = (layout.lineHeight - boxHeight) / 2;

  for (const line of layout.lines) {
    for (const run of line.pieces) {
      let x = run.x;

      for (const piece of text.pieces(run.text, run.weight)) {
        doc.font(piece.font).fontSize(layout.fontSize);
        doc.text(piece.text, x, line.top + offset, { lineBreak: false });
        x += doc.widthOfString(piece.text);
      }
    }
  }
}
