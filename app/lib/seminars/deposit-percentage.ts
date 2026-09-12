/**
 * The deposit rate of a seminar is the seminar's own, not the event's: it is
 * what fixes the place, a per-seminar fact (docs/domain/seminars.md, "The
 * seminar"). Its range is narrower than the event's by one value — a seminar
 * deposit of the whole price would make the deposit and the balance the same
 * threshold.
 */
export const DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE = 50;
export const MIN_SEMINAR_DEPOSIT_PERCENTAGE = 1;
export const MAX_SEMINAR_DEPOSIT_PERCENTAGE = 99;

export const invalidSeminarDepositPercentageMessage =
  "La seña del seminario debe ser un entero entre 1 y 99.";

export function isValidSeminarDepositPercentage(value: number) {
  return (
    Number.isInteger(value) &&
    value >= MIN_SEMINAR_DEPOSIT_PERCENTAGE &&
    value <= MAX_SEMINAR_DEPOSIT_PERCENTAGE
  );
}
