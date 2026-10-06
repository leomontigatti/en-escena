import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * The owner of `choreographyName`: what a name becomes when it is stored and
 * what it is refused for. Every path that writes the name goes through
 * `validateChoreographyName` (or the form field built on it), so a name typed
 * by an administrator is stored exactly as one typed by an academy. The
 * ordering of a list by name is `choreography-name.server.ts`.
 */

/** Twinned by the `choreography_name_length` CHECK in the schema. */
export const choreographyNameMaxLength = 120;
const invalidChoreographyNameMessage =
  "Ingresá un nombre válido para la coreografía.";
const choreographyNameTooLongMessage = `El nombre de la coreografía no puede superar los ${choreographyNameMaxLength} caracteres.`;

/** The Spanish particles that stay lowercase when they are not the first word. */
const lowercaseParticles = new Set([
  "a",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "y",
]);

/**
 * The stored form of a name: trimmed, whitespace runs collapsed to one space,
 * and in Spanish title case — every word capitalized, across hyphens too,
 * except a particle that is not the first word. It validates nothing.
 */
export function normalizeChoreographyName(value: string) {
  return value
    .trim()
    .split(/\s+/u)
    .map((word, index) => {
      const lowerWord = word.toLocaleLowerCase("es-AR");

      if (index > 0 && lowercaseParticles.has(lowerWord)) {
        return lowerWord;
      }

      return lowerWord.split("-").map(capitalizeFirstCharacter).join("-");
    })
    .join(" ");
}

function capitalizeFirstCharacter(value: string) {
  const [firstCharacter, ...rest] = Array.from(value);

  if (!firstCharacter) {
    return value;
  }

  return `${firstCharacter.toLocaleUpperCase("es-AR")}${rest.join("")}`;
}

/**
 * The stored form of a name, or why it cannot be stored: empty, without a
 * single letter or digit, or over the ceiling. The ceiling is measured on the
 * stored form.
 */
export function validateChoreographyName(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const name = normalizeChoreographyName(value);

  if (name.length === 0) {
    return { ok: false, message: requiredFieldMessage };
  }

  if (!hasChoreographyNameContent(name)) {
    return { ok: false, message: invalidChoreographyNameMessage };
  }

  if (name.length > choreographyNameMaxLength) {
    return { ok: false, message: choreographyNameTooLongMessage };
  }

  return { ok: true, value: name };
}

/**
 * Whether what was typed would change the stored name. A name typed differently
 * but stored the same is no change, and neither is one left untouched, even
 * when what is stored predates the rule: an edit of something else leaves it
 * as it is.
 */
export function isChoreographyNameChanged(typed: string, stored: string) {
  return typed !== stored && normalizeChoreographyName(typed) !== stored;
}

/** Whether there is a name to speak of: at least one letter or digit. */
export function hasChoreographyNameContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

/** The name in a Zod schema: a successful parse yields the stored form. */
export function choreographyNameField() {
  return z.string().transform((value, context) => {
    const result = validateChoreographyName(value);

    if (!result.ok) {
      context.addIssue({ code: "custom", message: result.message });

      return z.NEVER;
    }

    return result.value;
  });
}
