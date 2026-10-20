import { documentTypeOptions } from "@/lib/roster/identity-document";

import type { SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * The columns that identify a roster person in an export: who they are and
 * which academy's roster the row comes from. A person missing a document keeps
 * the row, with those cells blank, so the gap is visible.
 */

export type RosterPersonIdentityRow = {
  documentNumber: string | null;
  documentType: (typeof documentTypeOptions)[number]["value"] | null;
  firstName: string;
  lastName: string;
};

export type RosterPersonExportRow = RosterPersonIdentityRow & {
  academyName: string;
};

export const rosterPersonNameColumn: SheetColumn<RosterPersonIdentityRow> = {
  header: "Nombre completo",
  width: 30,
  cell: (row) => `${row.firstName} ${row.lastName}`,
};

export const rosterPersonDocumentTypeColumn: SheetColumn<RosterPersonIdentityRow> =
  {
    header: "Tipo de documento",
    width: 18,
    cell: (row) =>
      documentTypeOptions.find((option) => option.value === row.documentType)
        ?.label ?? null,
  };

export const rosterPersonDocumentNumberColumn: SheetColumn<RosterPersonIdentityRow> =
  {
    header: "Número de documento",
    width: 20,
    // Text, so a document keeps its leading zeros and its letters.
    cell: (row) => row.documentNumber,
  };

export const rosterPersonIdentityColumns: SheetColumn<RosterPersonIdentityRow>[] =
  [
    rosterPersonNameColumn,
    rosterPersonDocumentTypeColumn,
    rosterPersonDocumentNumberColumn,
  ];

/** A real date, so a spreadsheet can sort by it and read each age off it. */
export const rosterPersonBirthDateColumn: SheetColumn<{
  /** A date-only value. */
  birthDate: string;
}> = {
  header: "Fecha de nacimiento",
  width: 14,
  cell: (row) => ({
    format: "dd/mm/yyyy",
    type: Date,
    value: new Date(`${row.birthDate}T00:00:00Z`),
  }),
};

export const rosterPersonAcademyColumn: SheetColumn<RosterPersonExportRow> = {
  header: "Academia",
  width: 30,
  cell: (row) => row.academyName,
};
