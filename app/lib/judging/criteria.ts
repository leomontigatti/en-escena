/**
 * The rule a submodality's scoring sheet has to satisfy, kept away from both the
 * form and the database because the same rule is asked twice: once by the
 * criteria dialog as the administrator types, and once by the save on the
 * server. See docs/domain/judging.md, "Scores And Feedback".
 *
 * The adding maxima total exactly 100, so a sheet can always reach 100, and the
 * deduction maxima sit outside that total because a deduction is a penalty and
 * not a share of the score. An empty list is valid and means the submodality is
 * scored with a single 0-100 value instead of a sheet.
 */

export const criterionKinds = ["adds", "deducts"] as const;

export type CriterionKind = (typeof criterionKinds)[number];

export const addingCriteriaTotal = 100;

export const criterionMaximumMessage = "Ingresá un número entero desde 1.";

export const addingCriteriaTotalMessage =
  "El total de los criterios que suman debe ser igual a 100.";

export type CriterionMaximumInput = {
  kind: CriterionKind;
  maximum: number | string;
};

export type CriteriaMaximaValidation =
  { ok: true } | { ok: false; fieldErrors: Record<string, string> };

/**
 * The typed maximum as a number, or null when it is not a whole number from 1.
 * The field takes digits only, so anything else — a decimal point, a sign, a
 * stray character — is a value the sheet cannot use rather than one to round.
 */
export function parseCriterionMaximum(value: number | string): number | null {
  const text = typeof value === "number" ? String(value) : value.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const maximum = Number.parseInt(text, 10);

  return maximum >= 1 ? maximum : null;
}

/**
 * The live total the dialog shows against 100. Maxima that are not usable count
 * as nothing, so the counter reads what could be saved rather than jumping
 * around while a number is half typed.
 */
export function sumAddingCriteriaMaxima(
  criteria: readonly CriterionMaximumInput[],
): number {
  return criteria.reduce((total, criterion) => {
    if (criterion.kind !== "adds") {
      return total;
    }

    return total + (parseCriterionMaximum(criterion.maximum) ?? 0);
  }, 0);
}

/**
 * The whole-sheet rule. A bad maximum is reported on its own row and holds the
 * total error back: until every maximum is a number, the total says nothing
 * about whether the sheet adds up.
 */
export function validateCriteriaMaxima(
  criteria: readonly CriterionMaximumInput[],
): CriteriaMaximaValidation {
  const fieldErrors: Record<string, string> = {};

  criteria.forEach((criterion, index) => {
    if (parseCriterionMaximum(criterion.maximum) === null) {
      fieldErrors[`criteria.${index}.maximum`] = criterionMaximumMessage;
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  if (
    criteria.length > 0 &&
    sumAddingCriteriaMaxima(criteria) !== addingCriteriaTotal
  ) {
    return {
      ok: false,
      fieldErrors: { criteria: addingCriteriaTotalMessage },
    };
  }

  return { ok: true };
}

export const duplicateCriterionNameMessage =
  "Usá un nombre distinto para el criterio.";

/**
 * Two criteria of one submodality cannot be called the same thing, and the
 * dialog and the save have to agree on when that is: the same comparison as the
 * `(submodality, lower(name))` index the save writes against — trimmed,
 * accent-insensitive and case-insensitive — so a name the dialog accepts is
 * never one the server then refuses.
 *
 * Both sides of a repetition are reported, because the administrator has to see
 * which two rows are the pair. An empty name is nobody's duplicate; it is the
 * required-field rule's to refuse.
 */
export function duplicateCriterionNameErrors(
  names: readonly string[],
): Map<number, string> {
  const firstIndexByName = new Map<string, number>();
  const errors = new Map<number, string>();

  names.forEach((name, index) => {
    const normalized = name
      .trim()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("es");

    if (!normalized) {
      return;
    }

    const firstIndex = firstIndexByName.get(normalized);

    if (firstIndex === undefined) {
      firstIndexByName.set(normalized, index);
      return;
    }

    errors.set(firstIndex, duplicateCriterionNameMessage);
    errors.set(index, duplicateCriterionNameMessage);
  });

  return errors;
}
