/**
 * What the panel's work adds up to for one presentation: an average, and the
 * award read off it. See docs/domain/judging.md, "Scores And Feedback".
 *
 * There are no positions, no ties and no competitive grouping — a presentation
 * is measured against the bands and against nothing else, so two dances that
 * average the same take the same award home. Who reads a result, and what of
 * it, is `presentation-results.server.ts`'s.
 */

export type Award = "specialMention" | "bronze" | "silver" | "gold";

export const awardLabels: Record<Award, string> = {
  bronze: "Medalla de bronce",
  gold: "Medalla de oro",
  silver: "Medalla de plata",
  specialMention: "Mención especial",
};

/**
 * A presentation's result as every surface reads it. `unscored` is a panel
 * that has saved no value yet; `disqualified` is out of the results whatever
 * the judges saved; only `scored` has an average, and it always has an award.
 */
export type PresentationResult =
  | { kind: "unscored" }
  | { kind: "disqualified" }
  | { average: number; award: Award; kind: "scored" };

/** The average a page shows beside the award: only a scored result has one. */
export function resultAverage(result: PresentationResult): number | null {
  return result.kind === "scored" ? result.average : null;
}

/**
 * The result of one presentation from the values its judges saved, as the
 * numeric column reads them. The average is their mean rounded to two
 * decimals, and the award is read off that rounded average, so what a page
 * shows is exactly what decides the award.
 */
export function resolvePresentationResult(input: {
  disqualified: boolean;
  values: readonly (string | null)[];
}): PresentationResult {
  if (input.disqualified) {
    return { kind: "disqualified" };
  }

  const counted = input.values.flatMap((value) =>
    value === null ? [] : [Number.parseFloat(value)],
  );

  if (counted.length === 0) {
    return { kind: "unscored" };
  }

  const mean =
    counted.reduce((running, value) => running + value, 0) / counted.length;
  const average = Math.round(mean * 100) / 100;

  return { average, award: awardForAverage(average), kind: "scored" };
}

function awardForAverage(average: number): Award {
  if (average >= 90) {
    return "gold";
  }

  if (average >= 80) {
    return "silver";
  }

  return average >= 60 ? "bronze" : "specialMention";
}
