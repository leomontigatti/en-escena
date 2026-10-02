import {
  addingCriteriaTotal,
  addingCriteriaTotalMessage,
  criterionMaximumMessage,
  duplicateCriterionNameErrors,
  parseCriterionMaximum,
  sumAddingCriteriaMaxima,
  type CriterionKind,
  type CriterionMaximumInput,
} from "@/lib/judging/criteria";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * The rule one sheet of a submodality is saved against, asked by the criteria
 * editor as the administrator types and by the save on the server. See
 * docs/domain/judging.md, "Scores And Feedback".
 *
 * A submodality's criteria are edited one sheet at a time: `Técnico
 * obligatorio` (the general criteria, on every sheet) or one level's own. A
 * level's sheet is the general criteria plus its own, so its own are what is
 * left to reach 100. The general criteria cannot know which level the
 * administrator will complete next, so they may leave a level short — the
 * editor lists the sheets that are — but never above 100, which no level could
 * then reach; and where a category of the modality has no levels they are a
 * sheet on their own and must reach 100 by themselves.
 */

export type StoredSheetCriterion = {
  experienceLevel: ExperienceLevel | null;
  kind: CriterionKind;
  maximum: number;
  name: string;
};

/** Which sheets the categories of a submodality's modality score on. */
export type OfferedSheets = {
  /** Some category of the modality has no levels, so its sheet is the general criteria alone. */
  generalStandsAlone: boolean;
  /** The levels the categories of the modality offer. */
  levels: readonly ExperienceLevel[];
};

export type SheetRule = {
  /** How many criteria the rest of the sheet carries, which a sheet with none of its own still has. */
  fixedCount: number;
  /** The adding maxima the rest of the sheet already holds. */
  fixedAddingTotal: number;
  /** The names the rest of the sheet uses, which this part cannot repeat. */
  reservedNames: readonly string[];
  target: "exact" | "atMost";
};

export type SheetCriterionInput = CriterionMaximumInput & { name: string };

export type SheetCriteriaValidation =
  { ok: true } | { fieldErrors: Record<string, string>; ok: false };

export const generalOvershootMessage =
  "El total de los criterios que suman no puede superar 100.";

export function sheetRuleFor(
  experienceLevel: ExperienceLevel | null,
  stored: readonly StoredSheetCriterion[],
  offered: OfferedSheets,
): SheetRule {
  if (experienceLevel === null) {
    const levelCriteria = stored.filter(
      (criterion) => criterion.experienceLevel !== null,
    );

    return {
      fixedAddingTotal: 0,
      fixedCount: 0,
      reservedNames: levelCriteria.map((criterion) => criterion.name),
      target: offered.generalStandsAlone ? "exact" : "atMost",
    };
  }

  const general = stored.filter(
    (criterion) => criterion.experienceLevel === null,
  );

  return {
    fixedAddingTotal: sumAddingCriteriaMaxima(general),
    fixedCount: general.length,
    reservedNames: general.map((criterion) => criterion.name),
    target: "exact",
  };
}

export function validateSheetCriteria(
  criteria: readonly SheetCriterionInput[],
  rule: SheetRule,
): SheetCriteriaValidation {
  const fieldErrors: Record<string, string> = {};

  criteria.forEach((criterion, index) => {
    if (!criterion.name.trim()) {
      fieldErrors[`criteria.${index}.name`] = requiredFieldMessage;
    }

    if (parseCriterionMaximum(criterion.maximum) === null) {
      fieldErrors[`criteria.${index}.maximum`] = criterionMaximumMessage;
    }
  });

  const names = criteria.map((criterion) => criterion.name);
  const duplicates = duplicateCriterionNameErrors([
    ...rule.reservedNames,
    ...names,
  ]);

  for (const [index, message] of duplicates) {
    // The reserved names are only there to be clashed with: they are saved
    // already, and the error belongs on the row being typed.
    if (index >= rule.reservedNames.length) {
      fieldErrors[`criteria.${index - rule.reservedNames.length}.name`] =
        message;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, ok: false };
  }

  const totalError = sheetTotalError(criteria, rule);

  return totalError
    ? { fieldErrors: { criteria: totalError }, ok: false }
    : { ok: true };
}

/**
 * Why the sheet's adding maxima do not fit, or null when they do. A sheet with
 * no criteria at all is scored with a single 0-100 value, so it has no total to
 * reach.
 */
export function sheetTotalError(
  criteria: readonly CriterionMaximumInput[],
  rule: SheetRule,
): string | null {
  if (criteria.length + rule.fixedCount === 0) {
    return null;
  }

  const total = rule.fixedAddingTotal + sumAddingCriteriaMaxima(criteria);

  if (rule.target === "atMost") {
    return total > addingCriteriaTotal ? generalOvershootMessage : null;
  }

  return total === addingCriteriaTotal ? null : addingCriteriaTotalMessage;
}

export type SheetGap = {
  experienceLevel: ExperienceLevel | null;
  total: number;
};

/**
 * The offered sheets whose adding maxima miss 100, in the order the editor
 * lists them: the general criteria standing alone first, then the levels.
 */
export function sheetGaps(
  stored: readonly StoredSheetCriterion[],
  offered: OfferedSheets,
): SheetGap[] {
  const general = stored.filter(
    (criterion) => criterion.experienceLevel === null,
  );
  const sheets: {
    criteria: StoredSheetCriterion[];
    level: ExperienceLevel | null;
  }[] = [
    ...(offered.generalStandsAlone ? [{ criteria: general, level: null }] : []),
    ...offered.levels.map((level) => ({
      criteria: [
        ...general,
        ...stored.filter((criterion) => criterion.experienceLevel === level),
      ],
      level,
    })),
  ];

  return sheets.flatMap(({ criteria, level }) => {
    const total = sumAddingCriteriaMaxima(criteria);

    return criteria.length > 0 && total !== addingCriteriaTotal
      ? [{ experienceLevel: level, total }]
      : [];
  });
}
