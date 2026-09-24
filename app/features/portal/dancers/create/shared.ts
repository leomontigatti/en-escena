import { z } from "zod";
import {
  buildDancerBirthDateField,
  rosterDocumentPairFields,
  rosterPersonNameFields,
} from "@/lib/roster/roster-identity-fields";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";
import { refineDocumentPair } from "@/lib/roster/document-pair-schema";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";

export const createDancerIntent = "create-dancer";

export function buildCreateDancerSchema(eventStartDate: string | null) {
  // The document is optional at creation, so the per-academy rule acts from
  // the first save without being required to load a dancer.
  return z
    .object({
      ...rosterPersonNameFields,
      birthDate: buildDancerBirthDateField(eventStartDate),
      ...rosterDocumentPairFields,
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
      // Another dancer of the academy carries this name and birth date; the
      // dialog shows who and re-submits with their ids.
      status: "warning";
      warning: RosterNameWarning;
      values: CreateDancerFormValues;
      modalOpen: boolean;
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
