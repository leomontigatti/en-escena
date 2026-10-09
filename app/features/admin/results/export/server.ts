import { spreadsheetResponse } from "@/features/admin/day-export/server";
import { buildExportFileName } from "@/features/admin/day-export/shared";
import { readProgramExport } from "@/features/admin/presentations/program-export/server";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";

import { resultsExportColumns, type ResultsExportRow } from "./sheet";

/**
 * The results as a spreadsheet, for the organisation to work on outside the
 * app: the program of the event, or of one day, with each presentation's
 * average and award. See docs/domain/judging.md, "Program And Results".
 *
 * It reads results live and never asks whether they are published: the file is
 * for the organisation, and it is needed before the academies see anything. It
 * lists only what has a result: presentations not evaluated yet and
 * disqualified ones are left out.
 */
export async function loadResultsExport(request: Request): Promise<Response> {
  const { day, eventName, rows } = await readProgramExport(request);
  const results = await readPresentationResults(
    rows.map((row) => row.choreographyId),
  );
  const exported = rows.flatMap((row): ResultsExportRow[] => {
    const result = results.get(row.choreographyId);

    if (!result || result.average === null || result.award === null) {
      return [];
    }

    return [{ ...row, average: result.average, award: result.award }];
  });

  if (exported.length === 0) {
    throw new Response("Ningún resultado para ese día", { status: 404 });
  }

  return await spreadsheetResponse({
    columns: resultsExportColumns,
    fileName: buildExportFileName("resultados", eventName, day),
    rows: exported,
    sheet: "Resultados",
  });
}
