import type { Column, Table as TanStackTable } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import {
  dataTableSelectionColumnId,
  dataTableSelectionColumnWeight,
} from "@/components/shared/data-table.shared";
import { cn } from "@/lib/shared/utils";

/**
 * The row's widths, as a `colgroup` rather than a class on every cell.
 *
 * This is where a `fit` table's arithmetic lives, and it lives here because
 * this is the only place that can see all of it. A view declares what share of
 * the row each of its columns is worth; it cannot account for the selection
 * checkbox, because the table is what adds that column, and it should not have
 * to — so the fixed part comes out of the row first and the views' weights
 * divide what is left. That is also why the weights are relative: there is no
 * total to keep them adding up to, so no way to leave the row over-committed.
 *
 * A column with no weight is left to the browser, which under a fixed layout
 * means it shares whatever the weighted columns did not claim.
 */
export function DataTableColumnGroup<TData>({
  table,
}: {
  table: TanStackTable<TData>;
}) {
  const columns = table.getVisibleLeafColumns();
  const totalWeight = columns.reduce(
    (total, column) => total + resolveDataTableColumnWeight(column),
    0,
  );

  // A table whose columns all keep one shape on a phone writes its widths
  // inline. One that drops or reweighs a column below `sm` hands both widths
  // to a class instead, since an inline width would win on every screen.
  if (!columns.some(hasDataTableColumnPhoneShape)) {
    return (
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.id}
            style={{
              width: resolveDataTableColumnWidth({ column, totalWeight }),
            }}
          />
        ))}
      </colgroup>
    );
  }

  const phoneTotalWeight = columns.reduce(
    (total, column) => total + resolveDataTableColumnPhoneWeight(column),
    0,
  );

  return (
    <colgroup>
      {columns.map((column) => (
        <col
          key={column.id}
          className={cn(
            "w-(--column-width-phone) sm:w-(--column-width)",
            column.columnDef.meta?.hiddenBelowSm && "max-sm:hidden",
          )}
          style={
            {
              "--column-width": resolveDataTableColumnWidth({
                column,
                totalWeight,
              }),
              "--column-width-phone": resolveDataTableWeightWidth(
                resolveDataTableColumnPhoneWeight(column),
                phoneTotalWeight,
              ),
            } as CSSProperties
          }
        />
      ))}
    </colgroup>
  );
}

function hasDataTableColumnPhoneShape<TData>(column: Column<TData, unknown>) {
  const meta = column.columnDef.meta;

  return Boolean(meta?.hiddenBelowSm) || meta?.widthBelowSm !== undefined;
}

/** A column's share of the row below `sm`: none when a phone drops it. */
function resolveDataTableColumnPhoneWeight<TData>(
  column: Column<TData, unknown>,
) {
  if (column.columnDef.meta?.hiddenBelowSm) {
    return 0;
  }

  return (
    column.columnDef.meta?.widthBelowSm ?? resolveDataTableColumnWeight(column)
  );
}

/**
 * The selection column's weight is the table's own; every other column's is
 * what the view declared. Sharing the row by weight alone is what keeps each
 * width a plain percentage — see `dataTableSelectionColumnWeight`.
 */
function resolveDataTableColumnWeight<TData>(column: Column<TData, unknown>) {
  return column.id === dataTableSelectionColumnId
    ? dataTableSelectionColumnWeight
    : (column.columnDef.meta?.width ?? 0);
}

function resolveDataTableColumnWidth<TData>({
  column,
  totalWeight,
}: {
  column: Column<TData, unknown>;
  totalWeight: number;
}) {
  return resolveDataTableWeightWidth(
    resolveDataTableColumnWeight(column),
    totalWeight,
  );
}

function resolveDataTableWeightWidth(weight: number, totalWeight: number) {
  if (!weight || totalWeight <= 0) {
    return undefined;
  }

  // Kept as a division rather than a percentage worked out here: the browser
  // divides exactly, and a weight stays the number the view wrote.
  return `calc(100% * ${weight} / ${totalWeight})`;
}
