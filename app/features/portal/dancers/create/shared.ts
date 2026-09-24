import { z } from "zod";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";
import { buildBirthDateRefinement } from "@/lib/dancers/birth-date";
import { refineDocumentPair } from "@/lib/roster/document-pair-schema";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const createDancerIntent = "create-dancer";

export function buildCreateDancerSchema(eventStartDate: string | null) {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      birthDate: z
        .string()
        .trim()
        .min(1, requiredFieldMessage)
        .superRefine(buildBirthDateRefinement(eventStartDate)),
      // Optional: the document is asked for at creation so the per-academy
      // rule acts from the first save, not required to load a dancer.
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
    })
    .superRefine(refineDocumentPair);
}

export type CreateDancerFormValues = z.infer<
  ReturnType<typeof buildCreateDancerSchema>
>;

export const emptyDancerValues: CreateDancerFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
  documentType: "",
  documentNumber: "",
};

export type CreateDancerActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      fieldErrors: Partial<Record<keyof CreateDancerFormValues, string>>;
      values: CreateDancerFormValues;
      modalOpen: boolean;
      // The dancer already holding the document number, so the dialog can link
      // to them when the match is an archived one.
      duplicateDocumentDancerId?: string;
    }
  | undefined;

/**
 * The document refusal the create action can answer with, read for the field
 * it belongs to.
 */
export function getCreateDancerDocumentConflict(
  actionData?: CreateDancerActionData,
): RosterDocumentConflict {
  if (actionData?.status !== "error") {
    return {};
  }

  const matchId = actionData.duplicateDocumentDancerId;

  return {
    matchHref: matchId ? `/portal/bailarines/${matchId}` : undefined,
    matchLabel: "Ver la ficha del bailarín con ese documento",
    message: actionData.fieldErrors.documentNumber,
  };
}
