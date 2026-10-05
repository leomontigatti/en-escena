import { formatProvinceLabel, type Province } from "@/lib/academies/provinces";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";

import {
  buildSheet,
  type SheetColumn,
} from "@/features/admin/day-export/sheet";

/**
 * The program as a spreadsheet: one row per presentation, in running order.
 * Category stays apart from group type and modality apart from submodality,
 * and the day is a real date, so each can be filtered on its own.
 */

export type ProgramExportRow = {
  academyName: string;
  academyProvince: Province | null;
  categoryName: string;
  /** Whoever the reading asked to name: the program export, up to a trio. */
  dancerNames: string[];
  groupType: ChoreographyGroupType;
  modalityName: string;
  name: string;
  orderNumber: number;
  /** Every professor of the choreography, whatever its group. */
  professorNames: string[];
  scheduleName: string;
  scheduledDate: string;
  startTime: string;
  submodalityName: string | null;
};

/**
 * Every column but the dancers, which each export fills its own way. The
 * professors close it, so they sit right before the dancers in both.
 */
export const programColumns: SheetColumn<ProgramExportRow>[] = [
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
  {
    header: "Provincia",
    width: 16,
    cell: (row) => formatProvinceLabel(row.academyProvince),
  },
  { header: "Coreografía", width: 30, cell: (row) => row.name },
  {
    header: "Profesores",
    width: 28,
    cell: (row) => linePerName(row.professorNames),
  },
];

export const programExportColumns: SheetColumn<ProgramExportRow>[] = [
  ...programColumns,
  {
    header: "Bailarines",
    width: 28,
    cell: (row) => linePerName(row.dancerNames),
  },
];

/** One name per line of the cell, or an empty cell when there is none. */
function linePerName(names: string[]) {
  return names.length === 0 ? null : { value: names.join("\n"), wrap: true };
}

export function buildProgramSheet(rows: ProgramExportRow[]) {
  return buildSheet(programExportColumns, rows);
}
