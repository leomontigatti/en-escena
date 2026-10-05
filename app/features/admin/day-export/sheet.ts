import type { Cell, SheetData } from "write-excel-file/node";

/**
 * A spreadsheet export's sheet: one header row, then one row per item. A
 * spreadsheet is filtered and sorted rather than read top to bottom, so every
 * value keeps a column of its own.
 */

export type SheetColumn<Row> = {
  cell: (row: Row) => Cell;
  header: string;
  /** In characters, as a spreadsheet measures a column. */
  width: number;
};

export function buildSheet<Row>(
  columns: readonly SheetColumn<Row>[],
  rows: readonly Row[],
): SheetData {
  return [
    columns.map((column) => ({
      fontWeight: "bold" as const,
      value: column.header,
    })),
    ...rows.map((row) => columns.map((column) => column.cell(row) ?? null)),
  ];
}

/** Amounts are whole pesos, written as numbers so a spreadsheet can add them. */
export const moneyFormat = '"$"#,##0';

export function moneyCell(amount: number, bold = false) {
  return {
    ...(bold ? { fontWeight: "bold" as const } : {}),
    format: moneyFormat,
    type: Number,
    value: amount,
  };
}

/**
 * The sum of amounts some of which may be unknown: unknown as soon as one is,
 * rather than a partial sum that reads as complete.
 */
export function sumKnown(amounts: readonly (number | null)[]): number | null {
  return amounts.reduce<number | null>(
    (total, amount) =>
      total === null || amount === null ? null : total + amount,
    0,
  );
}
