import type { PortalDancerFormValues } from "@/features/portal/dancers/detail/shared";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";

// The page parses with the detail's schema: a new dancer asks for the same
// fields, photos included, and an empty photo key means "no photo".
export const emptyDancerValues: PortalDancerFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
  documentType: "",
  documentNumber: "",
  documentFrontImageStorageKey: "",
  documentBackImageStorageKey: "",
};

/**
 * A save that worked leaves the page, so only a refusal comes back. Its shape
 * is the detail's refusal, so the page reads it with the detail's helpers.
 */
export type CreateDancerActionData =
  | {
      // Another dancer of the academy carries this name and birth date; the
      // page shows who and re-submits with their ids.
      status: "warning";
      warning: RosterNameWarning;
      values: PortalDancerFormValues;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Partial<Record<keyof PortalDancerFormValues, string>>;
      values: PortalDancerFormValues;
      // The dancer already holding the document number, so the page can link
      // to them when the match is an archived one.
      duplicateDocumentDancerId?: string;
    }
  | undefined;
