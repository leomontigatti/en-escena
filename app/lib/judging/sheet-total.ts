import type { CriterionKind } from "@/lib/judging/criteria";
import {
  parseScoreValue,
  scoreValueMessage,
  singleScoreMaximum,
} from "@/lib/judging/score-value";

/**
 * What a sheet of criteria adds up to, asked twice like every other scoring
 * rule: once by the sheet as the judge taps, so the total at the top right
 * always reads what could be saved, and once by the save, which recomputes the
 * score's single value from it. See docs/domain/judging.md, "Scores And
 * Feedback".
 *
 * A deduction is a penalty rather than a share of the score, so it comes off
 * the additions instead of joining them, and the result is clamped: a sheet
 * whose penalties bite deeper than the dance earned is a zero, not a negative.
 */

export type SheetCriterionValue = {
  kind: CriterionKind;
  maximum: number;
  value: number | string;
};

/**
 * A value the judge is halfway through typing counts as nothing rather than
 * dragging the total around under their thumb: the number at the top right is
 * what the sheet could save right now.
 */
export function sheetTotal(entries: readonly SheetCriterionValue[]): number {
  const total = entries.reduce((running, entry) => {
    const value = parseScoreValue(entry.value, entry.maximum);

    if (value === null) {
      return running;
    }

    return entry.kind === "adds" ? running + value : running - value;
  }, 0);

  return Math.min(Math.max(total, 0), singleScoreMaximum);
}

export type SheetCriterion = {
  id: string;
  kind: CriterionKind;
  maximum: number;
  name: string;
};

export type SheetValuesValidation =
  | {
      ok: true;
      total: number;
      values: { criterionId: string; value: number }[];
    }
  | { fieldErrors: Record<string, string>; ok: false };

/**
 * The save's own reading of a sheet. It walks the submodality's criteria rather
 * than what was posted, so a field the form forgot — or never rendered, because
 * the criteria changed under it — is a refusal and not a silent zero.
 */
export function validateSheetValues(
  criteria: readonly SheetCriterion[],
  submitted: Readonly<Record<string, number | string | undefined>>,
): SheetValuesValidation {
  const fieldErrors: Record<string, string> = {};
  const values: { criterionId: string; value: number }[] = [];

  for (const criterion of criteria) {
    const raw = submitted[criterion.id];
    const value =
      raw === undefined ? null : parseScoreValue(raw, criterion.maximum);

    if (value === null) {
      fieldErrors[criterion.id] = scoreValueMessage(criterion.maximum);

      continue;
    }

    values.push({ criterionId: criterion.id, value });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, ok: false };
  }

  return {
    ok: true,
    total: sheetTotal(
      criteria.map((criterion) => ({
        kind: criterion.kind,
        maximum: criterion.maximum,
        value: submitted[criterion.id] ?? "",
      })),
    ),
    values,
  };
}
