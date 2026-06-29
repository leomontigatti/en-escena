export const DEFAULT_REQUIRED_DEPOSIT_PERCENTAGE = 30;
export const MIN_REQUIRED_DEPOSIT_PERCENTAGE = 1;
export const MAX_REQUIRED_DEPOSIT_PERCENTAGE = 100;

export const invalidRequiredDepositPercentageMessage =
  "La seña de coreografía debe ser un entero entre 1 y 100.";

export function isValidRequiredDepositPercentage(value: number) {
  return (
    Number.isInteger(value) &&
    value >= MIN_REQUIRED_DEPOSIT_PERCENTAGE &&
    value <= MAX_REQUIRED_DEPOSIT_PERCENTAGE
  );
}
