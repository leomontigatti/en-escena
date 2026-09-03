import {
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  compareSortValues,
  createColumnFilters,
  getActiveFacetedFilterValues,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValues,
  normalizeSearchValue,
} from "@/components/shared/data-table-helpers";
import type {
  DataTableColumn,
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableRowSelectionProps,
  DataTableSortDirection,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
    headerClassName?: string;
    cellClassName?: (row: TData) => string | undefined;
  }
}

export const emptyFacetedFilterValues: Record<
  string,
  DataTableFacetedFilterValue
> = {};

/**
 * A stable identity for "no faceted filters". Both tables resolve their
 * defaults on every render, and a fresh `[]` each time would make every effect
 * that reads the filters treat "no filters" as a change.
 */
export const emptyFacetedFilters: DataTableFacetedFilter[] = [];

/**
 * The search box's own state, seeded from the prop and re-seeded when it moves.
 * `lastAppliedSearchValueRef` is the server table's: it debounces the query into
 * the URL and needs to know what it last navigated with. The client table
 * filters in place and ignores it.
 */
export function useDataTableSearchQueryState(initialSearchValue: string) {
  const [searchQuery, setSearchQuery] = useState(initialSearchValue);
  const lastAppliedSearchValueRef = useRef(initialSearchValue);

  useEffect(() => {
    setSearchQuery(initialSearchValue);
    lastAppliedSearchValueRef.current = initialSearchValue;
  }, [initialSearchValue]);

  return { lastAppliedSearchValueRef, searchQuery, setSearchQuery };
}

/**
 * The faceted filters' state. The base values are the ones the caller pins —a
 * filter the reader cannot lift— and the initial ones are where the reader
 * starts; they are merged in that order every time either moves.
 */
export function useDataTableColumnFiltersState({
  baseFacetedFilterValues,
  initialFacetedFilterValues,
}: {
  baseFacetedFilterValues: Record<string, DataTableFacetedFilterValue>;
  initialFacetedFilterValues: Record<string, DataTableFacetedFilterValue>;
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    createMergedColumnFilters(
      baseFacetedFilterValues,
      initialFacetedFilterValues,
    ),
  );

  useEffect(() => {
    setColumnFilters(
      createMergedColumnFilters(
        baseFacetedFilterValues,
        initialFacetedFilterValues,
      ),
    );
  }, [baseFacetedFilterValues, initialFacetedFilterValues]);

  return { columnFilters, setColumnFilters };
}

function createMergedColumnFilters(
  baseFacetedFilterValues: Record<string, DataTableFacetedFilterValue>,
  initialFacetedFilterValues: Record<string, DataTableFacetedFilterValue>,
) {
  return createColumnFilters(
    mergeBaseFacetedFilterValues(
      baseFacetedFilterValues,
      initialFacetedFilterValues,
    ),
  );
}

/**
 * The sort, seeded from the prop and re-seeded when the caller moves it.
 *
 * The two fields are read out before the effect rather than depended on as one
 * object: every call site passes an object literal, so the object's identity
 * changes on each render and depending on it would re-seed the sort forever.
 * What the caller can actually move is the column and the direction.
 */
export function useDataTableSortingState(initialSort?: {
  columnId: string;
  direction: DataTableSortDirection;
}) {
  const sortColumnId = initialSort?.columnId;
  const sortDirection = initialSort?.direction;
  const [sorting, setSorting] = useState<SortingState>(() =>
    createSortingState(sortColumnId, sortDirection),
  );

  useEffect(() => {
    setSorting(createSortingState(sortColumnId, sortDirection));
  }, [sortColumnId, sortDirection]);

  return { sorting, setSorting };
}

function createSortingState(
  columnId?: string,
  direction?: DataTableSortDirection,
): SortingState {
  if (!columnId || !direction) {
    return [];
  }

  return [{ id: columnId, desc: direction === "desc" }];
}

export function createDataTableColumns<TData>(
  columns: DataTableColumn<TData>[],
  options: { selectableRows?: boolean } = {},
) {
  const tableColumns = columns.map<ColumnDef<TData>>((column) => ({
    id: column.id,
    header: column.header,
    cell: ({ row }) => column.cell(row.original),
    enableSorting: Boolean(column.sortValue),
    accessorFn: (row) => column.sortValue?.(row) ?? column.filterValue?.(row),
    filterFn: (row, _columnId, filterValue) => {
      if (isFacetedFilterValue(filterValue)) {
        const selectedValues = getActiveFacetedFilterValues(filterValue);

        if (selectedValues.length === 0) {
          return true;
        }

        const rowValues =
          column.filterValues?.(row.original) ??
          (column.filterValue ? [column.filterValue(row.original)] : []);

        return selectedValues.every((selectedValue) =>
          rowValues.some(
            (rowValue) =>
              normalizeSearchValue(rowValue) ===
              normalizeSearchValue(selectedValue),
          ),
        );
      }

      const normalizedQuery = normalizeSearchValue(String(filterValue));

      if (normalizedQuery.length === 0) {
        return true;
      }

      const value = column.filterValue?.(row.original);

      return value
        ? normalizeSearchValue(value).includes(normalizedQuery)
        : false;
    },
    sortingFn: (firstRow, secondRow) =>
      compareSortValues(
        column.sortValue?.(firstRow.original),
        column.sortValue?.(secondRow.original),
      ),
    meta: {
      className: column.className,
      headerClassName: column.headerClassName,
      cellClassName: column.cellClassName,
    },
  }));

  const visibleTableColumns = options.selectableRows
    ? [createSelectionColumn<TData>(), ...tableColumns]
    : tableColumns;

  if (columns.some((column) => column.id === dataTableFacetedFilterColumnId)) {
    return visibleTableColumns;
  }

  const facetedColumn: ColumnDef<TData> = {
    id: dataTableFacetedFilterColumnId,
    header: "Filtros",
    cell: () => null,
    accessorFn: (row) => getFacetedRowValues(columns, row).join(" "),
    filterFn: (row, _columnId, filterValue) => {
      if (!isFacetedFilterValue(filterValue)) {
        return true;
      }

      const selectedValues = getActiveFacetedFilterValues(filterValue);

      if (selectedValues.length === 0) {
        return true;
      }

      const rowValues = getFacetedRowValues(columns, row.original);

      return selectedValues.every((selectedValue) =>
        rowValues.some(
          (rowValue) =>
            normalizeSearchValue(rowValue) ===
            normalizeSearchValue(selectedValue),
        ),
      );
    },
  };

  return [...visibleTableColumns, facetedColumn];
}

export function createColumnVisibility<TData>(
  columns: DataTableColumn<TData>[],
) {
  return {
    [dataTableFacetedFilterColumnId]: false,
    ...Object.fromEntries(
      columns
        .filter((column) => column.hidden)
        .map((column) => [column.id, false]),
    ),
  };
}

function getFacetedRowValues<TData>(
  columns: DataTableColumn<TData>[],
  row: TData,
) {
  return columns.flatMap((column) => {
    const values =
      column.filterValues?.(row) ??
      (column.filterValue ? [column.filterValue(row)] : []);

    return values.filter((value) => value.length > 0);
  });
}

export function createGlobalFilterFn<TData>(columns: DataTableColumn<TData>[]) {
  return (row: Row<TData>, _columnId: string, filterValue: unknown) =>
    columns.some((column) => {
      const normalizedQuery = normalizeSearchValue(String(filterValue));

      if (normalizedQuery.length === 0) {
        return true;
      }

      const value = column.filterValue?.(row.original);

      return value
        ? normalizeSearchValue(value).includes(normalizedQuery)
        : false;
    });
}

/**
 * The selection state both tables hand to TanStack, controlled or not. Passing
 * `selectedRowIds` lifts it to the view — which is what a selection that drives
 * figures or actions outside the table needs — and leaving it out keeps it here.
 */
export function useDataTableRowSelection({
  onSelectedRowIdsChange,
  selectedRowIds,
}: Pick<
  DataTableRowSelectionProps,
  "onSelectedRowIdsChange" | "selectedRowIds"
>) {
  const [uncontrolledRowSelection, setUncontrolledRowSelection] =
    useState<RowSelectionState>({});
  const isSelectionControlled = selectedRowIds !== undefined;
  const controlledRowSelection = useMemo(
    () => Object.fromEntries((selectedRowIds ?? []).map((id) => [id, true])),
    [selectedRowIds],
  );
  const rowSelection = isSelectionControlled
    ? controlledRowSelection
    : uncontrolledRowSelection;

  // The select-all header toggles every visible row in one synchronous loop, so
  // each updater has to see the previous one's result. Uncontrolled selection
  // hands the updater to React, which chains them; controlled selection chains
  // them through a ref, since the prop only catches up on the next render.
  const latestRowSelectionRef = useRef(rowSelection);
  latestRowSelectionRef.current = rowSelection;

  const setRowSelection: OnChangeFn<RowSelectionState> = (updater) => {
    if (!isSelectionControlled) {
      setUncontrolledRowSelection(updater);
      return;
    }

    const next =
      typeof updater === "function"
        ? updater(latestRowSelectionRef.current)
        : updater;

    latestRowSelectionRef.current = next;
    onSelectedRowIdsChange?.(Object.keys(next).filter((rowId) => next[rowId]));
  };

  return { rowSelection, setRowSelection };
}

function createSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }) => {
      const selectableRows = table.getFilteredRowModel().rows;
      const hasRows = selectableRows.length > 0;
      const selectedRowCount = selectableRows.filter((row) =>
        row.getIsSelected(),
      ).length;
      const areAllRowsSelected =
        hasRows && selectedRowCount === selectableRows.length;
      const areSomeRowsSelected = selectedRowCount > 0 && !areAllRowsSelected;

      return (
        <Checkbox
          aria-label="Seleccionar todas las filas"
          checked={
            areAllRowsSelected ||
            (areSomeRowsSelected ? "indeterminate" : false)
          }
          disabled={!hasRows}
          onCheckedChange={(checked) => {
            for (const row of selectableRows) {
              row.toggleSelected(checked === true);
            }
          }}
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        aria-label="Seleccionar fila"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
    enableHiding: false,
    enableSorting: false,
    meta: {
      className: "w-10",
      headerClassName: "w-10",
    },
  };
}
