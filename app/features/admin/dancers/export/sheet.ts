import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  rosterPersonAcademyColumn,
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
  {
    header: "Fecha de nacimiento",
    width: 14,
    cell: (row) => ({
      format: "dd/mm/yyyy",
      type: Date,
      value: new Date(`${row.birthDate}T00:00:00Z`),
    }),
  },
  rosterPersonAcademyColumn,
];
