import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

export const missingTextContentMessage =
  "Ingresá al menos una letra o un número.";

/** Whether the text says anything: punctuation and symbols alone do not. */
function hasTextContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

/**
 * A required text field that has to hold a letter or a digit, so a name cannot
 * be saved as `.` or `-`.
 */
export function contentTextField() {
  return z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(hasTextContent, missingTextContentMessage);
}
