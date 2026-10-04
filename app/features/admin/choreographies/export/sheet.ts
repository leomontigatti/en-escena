import type { SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * The participation counts as a spreadsheet: one row per province or per
 * modality, then a total row. Academies and dancers are distinct counts, so a
 * dancer in two modalities is in both rows and once in the total.
 */

export type ParticipationCountRow = {
  academies: number;
  dancers: number;
  inscriptions: number;
  /** The closing row, which counts each academy and dancer once. */
  isTotal: boolean;
  label: string;
};

function emphasised(row: ParticipationCountRow, value: number | string) {
  return row.isTotal ? { fontWeight: "bold" as const, value } : value;
}

export function participationCountColumns(
  groupHeader: string,
): SheetColumn<ParticipationCountRow>[] {
  return [
    {
      header: groupHeader,
      width: 32,
      cell: (row) => emphasised(row, row.label),
    },
    {
      header: "Academias",
      width: 12,
      cell: (row) => emphasised(row, row.academies),
    },
    {
      header: "Bailarines",
      width: 12,
      cell: (row) => emphasised(row, row.dancers),
    },
    {
      header: "Inscripciones",
      width: 14,
      cell: (row) => emphasised(row, row.inscriptions),
    },
  ];
}
