import type { Cell, SheetData } from "write-excel-file/node";

import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";

/**
 * The program as a spreadsheet: one row per presentation, in running order,
 * under one header row. A spreadsheet is filtered and sorted rather than read
 * top to bottom, so every value keeps a column of its own (category apart from
 * group type, modality apart from submodality) and the day is a real date.
 */

export type ProgramExportRow = {
  academyName: string;
  academyProvince: string | null;
  categoryName: string;
  /** Filled up to a trio; a larger group's list would bury the row. */
  dancerNames: string[];
  groupType: ChoreographyGroupType;
  modalityName: string;
  name: string;
  orderNumber: number;
  scheduleName: string;
  scheduledDate: string;
  startTime: string;
  submodalityName: string | null;
};

type ProgramExportColumn = {
  cell: (row: ProgramExportRow) => Cell;
  header: string;
  /** In characters, as a spreadsheet measures a column. */
  width: number;
};

export const programExportColumns: ProgramExportColumn[] = [
  { header: "N.º", width: 6, cell: (row) => row.orderNumber },
  {
    header: "Día",
    width: 11,
    cell: (row) => ({
      format: "dd/mm/yyyy",
      type: Date,
      value: new Date(`${row.scheduledDate}T00:00:00Z`),
    }),
  },
  {
    header: "Horario",
    width: 26,
    cell: (row) => `${row.startTime} hs · ${row.scheduleName}`,
  },
  { header: "Categoría", width: 16, cell: (row) => row.categoryName },
  {
    header: "Tipo de grupo",
    width: 13,
    cell: (row) => formatGroupTypeLabel(row.groupType),
  },
  { header: "Modalidad", width: 20, cell: (row) => row.modalityName },
  { header: "Submodalidad", width: 20, cell: (row) => row.submodalityName },
  { header: "Academia", width: 28, cell: (row) => row.academyName },
  { header: "Provincia", width: 16, cell: (row) => row.academyProvince },
  { header: "Coreografía", width: 30, cell: (row) => row.name },
  {
    header: "Bailarines",
    width: 28,
    cell: (row) =>
      row.dancerNames.length === 0
        ? null
        : { value: row.dancerNames.join("\n"), wrap: true },
  },
];

export function buildProgramSheet(rows: ProgramExportRow[]): SheetData {
  return [
    programExportColumns.map((column) => ({
      fontWeight: "bold" as const,
      value: column.header,
    })),
    ...rows.map((row) =>
      programExportColumns.map((column) => column.cell(row) ?? null),
    ),
  ];
}
