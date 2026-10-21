/**
 * Montserrat comes as one file per subset of Unicode, and a PDF font draws
 * only the characters its file holds. A name may mix them ("Dvořák" needs
 * `latin-ext` for the ř), so the text is cut into pieces, each in the first
 * subset that covers it, `latin` first. A character no subset covers stays on
 * `latin`, and a combining mark on the piece of the letter it sits on.
 */

export type FontSubset = {
  name: string;
  ranges: (readonly [number, number])[];
};

// The order a character looks for its subset in: the one most text needs
// first, so a Spanish sentence stays one piece.
const preference = [
  "latin",
  "latin-ext",
  "vietnamese",
  "cyrillic",
  "cyrillic-ext",
];

/** Fontsource's `unicode.json`: each subset's CSS `unicode-range`. */
export function readFontSubsets(
  unicodeRanges: Record<string, string>,
): FontSubset[] {
  return preference
    .filter((name) => unicodeRanges[name] !== undefined)
    .map((name) => ({
      name,
      ranges: unicodeRanges[name].split(",").map((range) => {
        const [start, end = start] = range
          .trim()
          .replace(/^U\+/i, "")
          .split("-");

        return [parseInt(start, 16), parseInt(end, 16)] as const;
      }),
    }));
}

const combiningMark = /^\p{M}$/u;

export function splitByFontSubset(
  text: string,
  subsets: FontSubset[],
): { subset: string; text: string }[] {
  const pieces: { subset: string; text: string }[] = [];

  // Composed first, so "e" and a combining acute become one "é"; a mark left
  // over has no composed form and stays with its letter, which positions it.
  for (const character of text.normalize("NFC")) {
    const last = pieces.at(-1);

    if (last && combiningMark.test(character)) {
      last.text += character;
      continue;
    }

    const codePoint = character.codePointAt(0)!;
    const subset = (
      subsets.find((candidate) =>
        candidate.ranges.some(
          ([start, end]) => codePoint >= start && codePoint <= end,
        ),
      ) ?? subsets[0]
    ).name;

    if (last?.subset === subset) {
      last.text += character;
    } else {
      pieces.push({ subset, text: character });
    }
  }

  return pieces;
}
