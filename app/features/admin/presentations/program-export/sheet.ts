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
  /** Every dancer: named up to a trio, counted in a larger group. */
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

export const programExportColumns: SheetColumn<ProgramExportRow>[] = [
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
  {
    header: "Bailarines",
    width: 28,
    // A row has room for a trio's names; a larger group's would bury it.
    cell: (row) =>
      row.groupType === "grupal"
        ? row.dancerNames.length
        : linePerName(row.dancerNames),
  },
];

/** One name per line of the cell, or an empty cell when there is none. */
function linePerName(names: string[]) {
  return names.length === 0 ? null : { value: names.join("\n"), wrap: true };
}

export function buildProgramSheet(rows: ProgramExportRow[]) {
  return buildSheet(programExportColumns, rows);
}
