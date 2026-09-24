import { z } from "zod";
import {
  rosterDocumentPairFields,
  rosterPersonNameFields,
} from "@/lib/roster/roster-identity-fields";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";
import { refineDocumentPair } from "@/lib/roster/document-pair-schema";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";

export const createProfessorIntent = "create-professor";

// The document is optional at creation, so the per-academy rule acts from the
// first save without being required to load a professor.
export const createProfessorSchema = z
  .object({ ...rosterPersonNameFields, ...rosterDocumentPairFields })
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
      // Another professor of the academy carries this name; the dialog shows
      // who and re-submits with their ids.
      status: "warning";
      warning: RosterNameWarning;
      values: CreateProfessorFormValues;
      modalOpen: boolean;
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
