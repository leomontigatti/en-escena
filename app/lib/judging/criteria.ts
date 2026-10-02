/**
 * The pieces a submodality's criteria are checked with: a criterion's kind and
 * maximum, the adding total and the name comparison. How they combine into one
 * sheet's rule is `sheet-criteria.ts`. See docs/domain/judging.md, "Scores And
 * Feedback".
 *
 * The adding maxima total exactly 100, so a sheet can always reach 100, and the
 * deduction maxima sit outside that total because a deduction is a penalty and
 * not a share of the score.
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
