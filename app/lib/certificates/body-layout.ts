/**
 * Where the words of a `certificate`'s sentence go: wrapped at spaces inside
 * the template's body frame, each line centred, the block centred vertically.
 * When the lines do not fit the frame, the whole sentence shrinks together, so
 * a long name never ends up smaller than the words around it.
 *
 * Pure geometry in the template's own units: the PDF measures and draws, this
 * only decides where.
 */

export type CertificateWeight = "regular" | "bold";

/** A stretch of the sentence in one weight; the fields are the bold ones. */
export type CertificateRun = { text: string; weight: CertificateWeight };

export type CertificateBodyFrame = {
  /** The size the designer set, the largest the sentence is drawn at. */
  fontSize: number;
  height: number;
  left: number;
  /** A line's height as a multiple of the font size. */
  lineHeight: number;
  top: number;
  width: number;
};

export type MeasureText = (
  text: string,
  weight: CertificateWeight,
  fontSize: number,
) => number;

export type CertificateBodyPiece = CertificateRun & { x: number };

export type CertificateBodyLayout = {
  fontSize: number;
  lineHeight: number;
  lines: { pieces: CertificateBodyPiece[]; top: number }[];
};

// One unit is about 1 % of the designer's size: fine enough that the shrink
// stops close to the largest size that fits.
const shrinkStep = 1;
const smallestFontSize = 1;

/** A word is what sits between two spaces, whatever weights it mixes. */
type Word = { pieces: CertificateRun[]; spaceWeight: CertificateWeight };

export function layoutCertificateBody(
  runs: CertificateRun[],
  frame: CertificateBodyFrame,
  measure: MeasureText,
): CertificateBodyLayout {
  const words = splitWords(runs);
  let fontSize = frame.fontSize;
  let lines = wrap(words, frame.width, fontSize, measure);

  while (
    fontSize - shrinkStep >= smallestFontSize &&
    !fits(lines, frame, fontSize, measure)
  ) {
    fontSize -= shrinkStep;
    lines = wrap(words, frame.width, fontSize, measure);
  }

  const lineHeight = fontSize * frame.lineHeight;
  const blockTop = frame.top + (frame.height - lines.length * lineHeight) / 2;

  return {
    fontSize,
    lineHeight,
    lines: lines.map((line, index) => ({
      pieces: placePieces(line, frame, fontSize, measure),
      top: blockTop + index * lineHeight,
    })),
  };
}

function splitWords(runs: CertificateRun[]): Word[] {
  const words: Word[] = [];
  let current: Word = { pieces: [], spaceWeight: "regular" };

  for (const run of runs) {
    run.text.split(" ").forEach((text, index) => {
      if (index > 0) {
        if (current.pieces.length > 0) {
          words.push(current);
        }
        current = { pieces: [], spaceWeight: run.weight };
      }
      if (text !== "") {
        current.pieces.push({ text, weight: run.weight });
      }
    });
  }

  if (current.pieces.length > 0) {
    words.push(current);
  }

  return words;
}

function wrap(
  words: Word[],
  width: number,
  fontSize: number,
  measure: MeasureText,
): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];

  for (const word of words) {
    const candidate = [...line, word];

    if (line.length > 0 && lineWidth(candidate, fontSize, measure) > width) {
      lines.push(line);
      line = [word];
    } else {
      line = candidate;
    }
  }

  if (line.length > 0) {
    lines.push(line);
  }

  return lines;
}

function fits(
  lines: Word[][],
  frame: CertificateBodyFrame,
  fontSize: number,
  measure: MeasureText,
) {
  return (
    lines.length * fontSize * frame.lineHeight <= frame.height &&
    lines.every((line) => lineWidth(line, fontSize, measure) <= frame.width)
  );
}

/** A line as the pieces it is drawn in: same-weight neighbours merged. */
function lineRuns(line: Word[]): CertificateRun[] {
  const runs: CertificateRun[] = [];
  const append = (piece: CertificateRun) => {
    const last = runs.at(-1);

    if (last?.weight === piece.weight) {
      last.text += piece.text;
    } else {
      runs.push({ ...piece });
    }
  };

  line.forEach((word, index) => {
    if (index > 0) {
      append({ text: " ", weight: word.spaceWeight });
    }
    word.pieces.forEach(append);
  });

  return runs;
}

function lineWidth(line: Word[], fontSize: number, measure: MeasureText) {
  return lineRuns(line).reduce(
    (width, run) => width + measure(run.text, run.weight, fontSize),
    0,
  );
}

function placePieces(
  line: Word[],
  frame: CertificateBodyFrame,
  fontSize: number,
  measure: MeasureText,
): CertificateBodyPiece[] {
  let x = frame.left + (frame.width - lineWidth(line, fontSize, measure)) / 2;

  return lineRuns(line).map((run) => {
    const piece = { ...run, x };
    x += measure(run.text, run.weight, fontSize);

    return piece;
  });
}
