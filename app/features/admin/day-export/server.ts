import writeXlsxFile from "write-excel-file/node";

import { buildSheet, type SheetColumn } from "./sheet";

/** One sheet of a workbook: its tab name, its columns and its rows. */
export type WorkbookSheet<Row> = {
  columns: readonly SheetColumn<Row>[];
  rows: readonly Row[];
  sheet: string;
};

/** The workbook as a download: one sheet, its header row frozen. */
export async function spreadsheetResponse<Row>(
  input: WorkbookSheet<Row> & { fileName: string },
): Promise<Response> {
  return await workbookResponse({
    fileName: input.fileName,
    sheets: [workbookSheet(input)],
  });
}

/**
 * A workbook of several sheets as one download, each with its header row
 * frozen. Each sheet carries its own row type, so the caller builds them with
 * `workbookSheet` to keep columns and rows checked against each other.
 */
export async function workbookResponse(input: {
  fileName: string;
  sheets: readonly WorkbookSheet<never>[];
}): Promise<Response> {
  const workbook = await writeXlsxFile(
    input.sheets.map((sheet) => ({
      columns: sheet.columns.map(({ width }) => ({ width })),
      data: buildSheet<never>(sheet.columns, sheet.rows),
      sheet: sheet.sheet,
      stickyRowsCount: 1,
    })),
  ).toBuffer();

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

/** A sheet whose columns and rows agree on one row type. */
export function workbookSheet<Row>(
  sheet: WorkbookSheet<Row>,
): WorkbookSheet<never> {
  return sheet as unknown as WorkbookSheet<never>;
}
