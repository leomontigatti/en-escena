/**
 * The Argentine bank identifiers an event's payment instructions carry: the
 * CBU/CVU, the alias and the holder's CUIT. Every check is arithmetic on the
 * characters typed — it proves a digit was mistyped, never that the account
 * exists — so the outcomes are discriminated values rather than booleans: the
 * form says one thing when the count is wrong and another when the count is
 * right and a check digit is not.
 *
 * Deliberately free of any dependency on forms, routes or the database, so the
 * same module reaches the field through `zodResolver` and the action through
 * the shared event schema.
 */

const CBU_LENGTH = 22;
const CBU_FIRST_BLOCK_WEIGHTS = [7, 1, 3, 9, 7, 1, 3];
const CBU_SECOND_BLOCK_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

const ALIAS_PATTERN = /^[A-Za-z0-9.-]{6,20}$/;

const CUIT_LENGTH = 11;
const CUIT_BARE_PATTERN = /^\d{11}$/;
const CUIT_HYPHENATED_PATTERN = /^\d{2}-\d{8}-\d$/;
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export type CbuValidation = "ok" | "wrong-length" | "mistyped-digit";

export type AliasValidation = "ok" | "invalid";

export type CuitValidation = "ok" | "wrong-shape" | "mistyped-digit";

/**
 * One field takes both a CBU and a CVU: the `000` CVU prefix is not checked,
 * because nothing downstream needs to tell the two apart.
 */
export function validateCbu(value: string): CbuValidation {
  if (!/^\d+$/.test(value) || value.length !== CBU_LENGTH) {
    return "wrong-length";
  }

  const digits = toDigits(value);
  const firstBlockOk =
    digits[7] === checkDigitModTen(digits.slice(0, 7), CBU_FIRST_BLOCK_WEIGHTS);
  const secondBlockOk =
    digits[21] ===
    checkDigitModTen(digits.slice(8, 21), CBU_SECOND_BLOCK_WEIGHTS);

  return firstBlockOk && secondBlockOk ? "ok" : "mistyped-digit";
}

/** The caller lowercases on save; the check itself is case-insensitive. */
export function validateAlias(value: string): AliasValidation {
  return ALIAS_PATTERN.test(value) ? "ok" : "invalid";
}

/**
 * Eleven bare digits, or hyphens sitting exactly 2-8-1. Anything else — a
 * hyphen elsewhere, a space as a separator, a different count — is a shape
 * failure, so the message can state the count instead of blaming a digit.
 */
export function validateCuit(value: string): CuitValidation {
  if (!CUIT_BARE_PATTERN.test(value) && !CUIT_HYPHENATED_PATTERN.test(value)) {
    return "wrong-shape";
  }

  const digits = toDigits(value.replaceAll("-", ""));

  if (digits.length !== CUIT_LENGTH) {
    return "wrong-shape";
  }

  const sum = weightedSum(digits.slice(0, 10), CUIT_WEIGHTS);
  const remainder = sum % 11;

  // A remainder of 1 leaves no digit that completes the number: the accepted
  // digit would have to be 10.
  if (remainder === 1) {
    return "mistyped-digit";
  }

  const checkDigit = remainder === 0 ? 0 : 11 - remainder;

  return digits[10] === checkDigit ? "ok" : "mistyped-digit";
}

function toDigits(value: string) {
  return [...value].map((character) => Number(character));
}

function weightedSum(digits: number[], weights: number[]) {
  return digits.reduce(
    (sum, digit, index) => sum + digit * (weights[index] ?? 0),
    0,
  );
}

function checkDigitModTen(digits: number[], weights: number[]) {
  return (10 - (weightedSum(digits, weights) % 10)) % 10;
}
