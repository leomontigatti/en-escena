/**
 * The two deposit rates of an event, in one module because they are one rule
 * read twice: an integer percentage inside a range, refused with a message the
 * form shows. They differ only in their range and in who owns them.
 *
 * The choreography rate is the **event's**, set once on its bases and applied to
 * every choreography inscription. The seminar rate is the **seminar's own** —
 * it is what fixes the place, a per-seminar fact (docs/domain/seminars.md, "The
 * seminar") — and its range is narrower by one value, because a seminar deposit
 * of the whole price would make the deposit and the balance the same threshold.
 */
export const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = 30;
export const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 1;
export const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;

export const DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE = 50;
export const MIN_SEMINAR_DEPOSIT_PERCENTAGE = 1;
export const MAX_SEMINAR_DEPOSIT_PERCENTAGE = 99;

export const invalidRequiredDepositPercentageMessage =
  "La seña de coreografía debe ser un entero entre 1 y 100.";

export const invalidSeminarDepositPercentageMessage =
  "La seña del seminario debe ser un entero entre 1 y 99.";

export function isValidRequiredDepositPercentage(value: number) {
  return isDepositPercentageInRange(
    value,
    MIN_REQUIRED_DEPOSIT_PERCENTAGE,
    MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  );
}

export function isValidSeminarDepositPercentage(value: number) {
  return isDepositPercentageInRange(
    value,
    MIN_SEMINAR_DEPOSIT_PERCENTAGE,
    MAX_SEMINAR_DEPOSIT_PERCENTAGE,
  );
}

function isDepositPercentageInRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}
