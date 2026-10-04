import { documentTypeOptions } from "@/components/shared/document-type-options";

import type { SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * The columns that identify a roster person in an auditor export: who they
 * are and which academy's roster the row comes from. A person missing a
 * document keeps the row, with those cells blank, so the gap is visible.
 */

export type RosterPersonExportRow = {
  academyName: string;
  documentNumber: string | null;
  documentType: (typeof documentTypeOptions)[number]["value"] | null;
  firstName: string;
  lastName: string;
};

export const rosterPersonIdentityColumns: SheetColumn<RosterPersonExportRow>[] =
  [
    {
      header: "Nombre completo",
      width: 30,
      cell: (row) => `${row.firstName} ${row.lastName}`,
    },
    {
      header: "Tipo de documento",
      width: 18,
      cell: (row) =>
        documentTypeOptions.find((option) => option.value === row.documentType)
          ?.label ?? null,
    },
    {
      header: "Número de documento",
      width: 20,
      // Text, so a document keeps its leading zeros and its letters.
      cell: (row) => row.documentNumber,
    },
  ];

export const rosterPersonAcademyColumn: SheetColumn<RosterPersonExportRow> = {
  header: "Academia",
  width: 30,
  cell: (row) => row.academyName,
};
