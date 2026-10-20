import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  rosterPersonAcademyColumn,
  rosterPersonBirthDateColumn,
  rosterPersonIdentityColumns,
  type RosterPersonExportRow,
} from "@/features/admin/period-export/person-columns";

/**
 * The dancers as a spreadsheet: one row per dancer of an academy's roster,
 * with the birth date as a real date so the auditor can read each age.
 */

export type DancersExportRow = RosterPersonExportRow & {
  /** A date-only value. */
  birthDate: string;
};

export const dancersExportColumns: SheetColumn<DancersExportRow>[] = [
  ...rosterPersonIdentityColumns,
  rosterPersonBirthDateColumn,
  rosterPersonAcademyColumn,
];
