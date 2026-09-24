import { z } from "zod";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";
import { refineDocumentPair } from "@/lib/roster/document-pair-schema";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const createProfessorIntent = "create-professor";

export const createProfessorSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    // Optional: the document is asked for at creation so the per-academy rule
    // acts from the first save, not required to load a professor.
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
  })
  .superRefine(refineDocumentPair);

export type CreateProfessorFormValues = z.infer<typeof createProfessorSchema>;

export const emptyProfessorValues: CreateProfessorFormValues = {
  firstName: "",
  lastName: "",
  documentType: "",
  documentNumber: "",
};

export type CreateProfessorActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      fieldErrors: Partial<Record<keyof CreateProfessorFormValues, string>>;
      values: CreateProfessorFormValues;
      modalOpen: boolean;
      // The professor already holding the document number, so the dialog can
      // link to them when the match is an archived one.
      duplicateDocumentProfessorId?: string;
    }
  | undefined;

/**
 * The document refusal the create action can answer with, read for the field
 * it belongs to.
 */
export function getCreateProfessorDocumentConflict(
  actionData?: CreateProfessorActionData,
): RosterDocumentConflict {
  if (actionData?.status !== "error") {
    return {};
  }

  const matchId = actionData.duplicateDocumentProfessorId;

  return {
    matchHref: matchId ? `/portal/profesores/${matchId}` : undefined,
    matchLabel: "Ver la ficha del profesor con ese documento",
    message: actionData.fieldErrors.documentNumber,
  };
}
