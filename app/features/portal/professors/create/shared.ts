import type { ProfessorFormValues } from "@/features/portal/professors/detail/shared";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";

// The page parses with the detail's schema: a new professor asks for the same
// fields, and the document stays optional so the per-academy rule acts from
// the first save without being required to load a professor.
export const emptyProfessorValues: ProfessorFormValues = {
  firstName: "",
  lastName: "",
  documentType: "",
  documentNumber: "",
};

/**
 * A save that worked leaves the page, so only a refusal comes back. Its shape
 * is the detail's refusal, so the page reads it with the detail's helpers.
 */
export type CreateProfessorActionData =
  | {
      // Another professor of the academy carries this name; the page shows
      // who and re-submits with their ids.
      status: "warning";
      warning: RosterNameWarning;
      values: ProfessorFormValues;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: Partial<Record<keyof ProfessorFormValues, string>>;
      values: ProfessorFormValues;
      // The professor already holding the document number, so the page can
      // link to them when the match is an archived one.
      duplicateDocumentProfessorId?: string;
    }
  | undefined;
