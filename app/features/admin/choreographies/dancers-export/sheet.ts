import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  rosterPersonBirthDateColumn,
  rosterPersonDocumentNumberColumn,
  rosterPersonDocumentTypeColumn,
  rosterPersonNameColumn,
  type RosterPersonIdentityRow,
} from "@/features/admin/period-export/person-columns";
import { documentTypeEmptyLabel } from "@/lib/roster/identity-document";

/**
 * A choreography's dancers as a spreadsheet: one row per active inscription,
 * with the age the inscription was measured at for its category.
 */

export type ChoreographyDancersExportRow = RosterPersonIdentityRow & {
  ageAtEventStart: number;
  /** A date-only value. */
  birthDate: string;
};

export const choreographyDancersExportColumns: SheetColumn<ChoreographyDancersExportRow>[] =
  [
    rosterPersonNameColumn,
    {
      ...rosterPersonDocumentTypeColumn,
      // Said rather than left blank: the list goes out of the app, where a
      // blank cell reads as a document someone forgot to copy.
      cell: (row) =>
        rosterPersonDocumentTypeColumn.cell(row) ?? documentTypeEmptyLabel,
    },
    rosterPersonDocumentNumberColumn,
    rosterPersonBirthDateColumn,
    {
      header: "Edad al inicio del evento",
      width: 12,
      cell: (row) => row.ageAtEventStart,
    },
  ];
