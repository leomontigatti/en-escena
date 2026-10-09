import type { SheetColumn } from "@/features/admin/day-export/sheet";
import {
  programExportColumns,
  type ProgramExportRow,
} from "@/features/admin/presentations/program-export/sheet";
import { awardLabels, type Award } from "@/lib/judging/award";

/**
 * The results as a spreadsheet: the program's columns, with the
 * presentation's average and award at the end of the row.
 */

export type ResultsExportRow = ProgramExportRow & {
  average: number;
  award: Award;
};

export const resultsExportColumns: SheetColumn<ResultsExportRow>[] = [
  ...programExportColumns,
  {
    header: "Promedio",
    width: 10,
    cell: (row) => ({ format: "0.00", value: row.average }),
  },
  { header: "Premio", width: 18, cell: (row) => awardLabels[row.award] },
];
