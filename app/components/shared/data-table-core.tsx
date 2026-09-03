import {
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DataTableFacetedFilterControl,
  DataTablePagination,
  SortIcon,
} from "@/components/shared/data-table-controls";
import {
  compareSortValues,
  createColumnFilters,
  getActiveFacetedFilterValues,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValues,
  normalizeSearchValue,
  toSortDirection,
} from "@/components/shared/data-table-helpers";
import type {
  DataTableColumn,
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableRowSelectionProps,
  DataTableSortDirection,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

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

type DataTableShellProps<TData> = {
  table: TanStackTable<TData>;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  hideSearch?: boolean;
  hidePagination?: boolean;
  facetedFilters: DataTableFacetedFilter[];
  getSelectedFilterValues: (columnId: string) => DataTableFacetedFilterValue;
  onFacetedFilterChange: (values: DataTableFacetedFilterValue) => void;
  emptyMessage: string;
  basePath: string;
  filteredRowCount: number;
  totalRows: number;
  isLoading: boolean;
  pageCount: number;
  currentPage: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  pageHrefBuilder?: (page: number) => string;
  getServerSortHref?: (columnId: string) => string;
  getServerSortDirection?: (columnId: string) => DataTableSortDirection | false;
};

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

export function DataTableShell<TData>({
  table,
  getRowProps,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  hideSearch = false,
  hidePagination = false,
  facetedFilters,
  getSelectedFilterValues,
  onFacetedFilterChange,
  emptyMessage,
  basePath,
  filteredRowCount,
  totalRows,
  isLoading,
  pageCount,
  currentPage,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageChange,
  pageHrefBuilder,
  getServerSortHref,
  getServerSortDirection,
}: DataTableShellProps<TData>) {
  const visibleRows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      {!hideSearch || facetedFilters.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {!hideSearch ? (
              <label className="relative block sm:max-w-md sm:flex-1 lg:max-w-xl">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <span className="sr-only">Buscar en la tabla</span>
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="pr-8 pl-8"
                />
                {searchQuery.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => onSearchChange("")}
                  >
                    <X aria-hidden="true" data-icon />
                    <span className="sr-only">Limpiar búsqueda</span>
                  </Button>
                ) : null}
              </label>
            ) : null}
            {facetedFilters.length > 0 ? (
              <TooltipProvider>
                <div className="flex flex-wrap justify-end gap-2">
                  <DataTableFacetedFilterControl
                    groups={facetedFilters}
                    selectedValues={getSelectedFilterValues(
                      dataTableFacetedFilterColumnId,
                    )}
                    onChange={onFacetedFilterChange}
                  />
                </div>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-lg border bg-background transition-opacity",
          isLoading && "opacity-75",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "px-3",
                      header.column.columnDef.meta?.headerClassName,
                    )}
                  >
                    {header.column.getCanSort() && getServerSortHref ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-sm"
                      >
                        <Link to={getServerSortHref(header.column.id)}>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <SortIcon
                            direction={getServerSortDirection?.(
                              header.column.id,
                            )}
                          />
                        </Link>
                      </Button>
                    ) : header.column.getCanSort() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-sm"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon
                          direction={toSortDirection(
                            header.column.getIsSorted(),
                          )}
                        />
                      </Button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => {
                const rowProps = getRowProps?.(row.original) ?? {};

                return (
                  <TableRow key={row.id} {...rowProps}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "px-3",
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.cellClassName?.(
                            row.original,
                          ),
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredRowCount} de {totalRows}{" "}
            {totalRows === 1 ? "registro" : "registros"}
            {isLoading ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <LoaderCircle
                  className="size-3 animate-spin"
                  aria-hidden="true"
                />
                Actualizando…
              </span>
            ) : null}
          </p>
          <DataTablePagination
            basePath={basePath}
            pageCount={pageCount}
            currentPage={currentPage}
            canPreviousPage={canPreviousPage}
            canNextPage={canNextPage}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
            onPageChange={onPageChange}
            pageHrefBuilder={pageHrefBuilder}
          />
        </div>
      ) : null}
    </div>
  );
}
