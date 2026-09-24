/**
 * What the panel's work adds up to for one presentation: an average, and the
 * medal read off it. See docs/domain/judging.md, "Scores And Feedback".
 *
 * There are no positions, no ties and no competitive grouping — a presentation
 * is measured against the bands and against nothing else, so two dances that
 * average the same take the same medal home. PRD 1 shows this to administration
 * only; publishing it is PRD 2's.
 */

export type Medal = "specialMention" | "bronze" | "silver" | "gold";

export const medalLabels: Record<Medal, string> = {
  bronze: "Medalla de bronce",
  gold: "Medalla de oro",
  silver: "Medalla de plata",
  specialMention: "Mención especial",
};

export type AveragedScore = {
  annulled: boolean;
  /** The saved score, as the numeric column reads it, or null when there is none. */
  value: string | null;
};

export type PresentationAverageInput = {
  disqualified: boolean;
  scores: readonly AveragedScore[];
};

/**
 * The mean of what still counts, rounded to two decimals, or null when there is
 * nothing to average. An annulled score keeps its number but stops counting,
 * and a disqualified presentation is out of the results altogether — so both
 * read as "no average" rather than as a lower one.
 */
export function presentationAverage(
  input: PresentationAverageInput,
): number | null {
  if (input.disqualified) {
    return null;
  }

  const counted = input.scores
    .filter((score) => !score.annulled && score.value !== null)
    .map((score) => Number.parseFloat(score.value as string));

  if (counted.length === 0) {
    return null;
  }

  const mean =
    counted.reduce((running, value) => running + value, 0) / counted.length;

  return Math.round(mean * 100) / 100;
}

/**
 * The bands are fixed in the domain and read off the rounded average, so what
 * administration sees on screen is exactly what decides the medal.
 */
export function medalForAverage(average: number): Medal {
  if (average >= 90) {
    return "gold";
  }

  if (average >= 80) {
    return "silver";
  }

  return average >= 60 ? "bronze" : "specialMention";
}
