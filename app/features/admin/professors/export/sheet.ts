import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  rosterPersonAcademyColumn,
  rosterPersonIdentityColumns,
  type RosterPersonExportRow,
} from "@/features/admin/period-export/person-columns";

/**
 * The professors as a spreadsheet: one row per professor of an academy's
 * roster, for the auditor to identify each person.
 */

export type ProfessorsExportRow = RosterPersonExportRow;

export const professorsExportColumns: SheetColumn<ProfessorsExportRow>[] = [
  ...rosterPersonIdentityColumns,
  rosterPersonAcademyColumn,
];
