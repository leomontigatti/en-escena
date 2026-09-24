import { z } from "zod";

import { buildBirthDateRefinement } from "@/lib/dancers/birth-date";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * The field shapes every roster person form repeats — portal and panel, dancer
 * and professor. Each surface still composes its own schema, because the
 * document pair is refined differently on each side.
 */
export const rosterPersonNameFields = {
  firstName: z.string().trim().min(1, requiredFieldMessage),
  lastName: z.string().trim().min(1, requiredFieldMessage),
};

export const rosterDocumentPairFields = {
  documentType: z.string().trim(),
  documentNumber: z.string().trim(),
};

export const rosterDocumentImageFields = {
  documentFrontImageStorageKey: z.string().trim(),
  documentBackImageStorageKey: z.string().trim(),
};

/** The birth date every dancer form asks for, refused when the dancer would be too young at the event start. */
export function buildDancerBirthDateField(eventStartDate: string | null) {
  return z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .superRefine(buildBirthDateRefinement(eventStartDate));
}
