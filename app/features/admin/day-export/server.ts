import writeXlsxFile from "write-excel-file/node";

import { buildSheet, type SheetColumn } from "./sheet";

/** The workbook as a download: one sheet, its header row frozen. */
export async function spreadsheetResponse<Row>(input: {
  columns: readonly SheetColumn<Row>[];
  fileName: string;
  rows: readonly Row[];
  sheet: string;
}): Promise<Response> {
  const workbook = await writeXlsxFile(buildSheet(input.columns, input.rows), {
    columns: input.columns.map(({ width }) => ({ width })),
    sheet: input.sheet,
    stickyRowsCount: 1,
  }).toBuffer();

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${input.fileName}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
