/**
 * What a judge is allowed to type into a score field, asked twice: once by the
 * form as the judge taps and once by the save on the server, so the two can
 * never disagree about what a valid score is. See docs/domain/judging.md,
 * "Scores And Feedback".
 *
 * Every score moves in half points, which is what the panel works in, and the
 * maximum is the field's own: 100 for a single score, the criterion's own
 * maximum on a sheet. The separator is a point and only a point — a tablet's
 * numeric keypad types one, and the field is the deliberate exception to es-AR
 * formatting the PRD calls out.
 */

export const singleScoreMaximum = 100;

const scoreStep = 0.5;

export function scoreValueMessage(maximum: number = singleScoreMaximum) {
  return `Ingresá un valor de 0 a ${maximum}, de 0.5 en 0.5.`;
}

/**
 * The typed score as a number, or null when the field cannot be saved as it
 * stands. A half-typed value is a value the sheet cannot use rather than one to
 * round, so nothing here repairs the input.
 */
export function parseScoreValue(
  value: number | string,
  maximum: number = singleScoreMaximum,
): number | null {
  const text = typeof value === "number" ? String(value) : value.trim();

  if (!/^\d+(\.\d)?$/.test(text)) {
    return null;
  }

  const parsed = Number.parseFloat(text);

  if (parsed > maximum) {
    return null;
  }

  // Read in tenths, because 90.5 % 0.5 is not reliably 0 in binary floating
  // point and a judge's half point must never be refused by arithmetic.
  return Math.round(parsed * 10) % (scoreStep * 10) === 0 ? parsed : null;
}

/** The score as the numeric column stores and reads it: one decimal, always. */
export function formatScoreValue(value: number): string {
  return value.toFixed(1);
}
