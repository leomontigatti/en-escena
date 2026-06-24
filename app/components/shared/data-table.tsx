import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { LoaderCircle, Search, X } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useNavigation } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTableFacetedFilterControl,
  DataTablePagination,
  SortIcon,
} from "@/components/shared/data-table-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
  compareSortValues,
  createColumnFilters,
  getActiveFacetedFilterValues,
  getNextServerSortDirection,
  getSelectedFacetedFilterValue,
  getServerSortDirection,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValue,
  mergeBaseFacetedFilterValues,
  mergeServerFilterValues,
  normalizeSearchValue,
  toSortDirection,
} from "@/components/shared/data-table-helpers";
import { cn } from "@/lib/shared/utils";

type SortDirection = "asc" | "desc";

type SortValue = string | number | Date | boolean | null | undefined;

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
    headerClassName?: string;
  }
}

export type DataTableColumn<TData> = {
  id: string;
  header: string;
  cell: (row: TData) => React.ReactNode;
  hidden?: boolean;
  className?: string;
  headerClassName?: string;
  filterValue?: (row: TData) => string;
  filterValues?: (row: TData) => string[];
  sortValue?: (row: TData) => SortValue;
};

export type DataTableFacetedFilter = {
  columnId: string;
  label: string;
  groups: DataTableFacetedFilterGroup[];
};

type DataTableFacetedFilterGroup = {
  id?: string;
  label: string;
  options: DataTableFacetedFilterOption[];
};

type DataTableFacetedFilterOption = {
  label: string;
  value: string;
};

type DataTableFacetedFilterValue = Record<string, string>;

type DataTableBaseProps<TData> = {
  rows: TData[];
  columns: DataTableColumn<TData>[];
  getRowKey: (row: TData) => string;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  searchPlaceholder: string;
  initialSearchValue?: string;
  facetedFilters?: DataTableFacetedFilter[];
  emptyMessage?: string;
  baseFacetedFilterValues?: Record<string, DataTableFacetedFilterValue>;
  initialFacetedFilterValues?: Record<string, DataTableFacetedFilterValue>;
};

type DataTableClientProps<TData> = DataTableBaseProps<TData> & {
  mode: "client";
  textFilterColumnId?: string;
  initialSort?: {
    columnId: string;
    direction: SortDirection;
  };
};

type DataTableServerProps<TData> = DataTableBaseProps<TData> & {
  mode: "server";
  currentPage: number;
  totalPages: number;
  totalRows: number;
  basePath?: string;
  initialSort?: {
    columnId: string;
    direction: SortDirection;
  };
  loading?: boolean;
  pageParamName?: string;
  searchParamName?: string;
  sortParamName?: string;
};

type DataTableProps<TData> =
  | DataTableClientProps<TData>
  | DataTableServerProps<TData>;

export {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
};

const emptyFacetedFilterValues: Record<string, DataTableFacetedFilterValue> =
  {};

export function DataTable<TData>(props: DataTableProps<TData>) {
  const {
    rows,
    columns,
    getRowKey,
    getRowProps,
    searchPlaceholder,
    initialSearchValue = "",
    facetedFilters = [],
    emptyMessage = "No hay resultados para mostrar.",
    baseFacetedFilterValues = emptyFacetedFilterValues,
    initialFacetedFilterValues = emptyFacetedFilterValues,
  } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useOptionalNavigation();
  const isServerMode = props.mode === "server";
  const textFilterColumnId =
    props.mode === "client" ? props.textFilterColumnId : undefined;
  const initialSort = props.initialSort;
  const serverBasePath = props.mode === "server" ? props.basePath : undefined;
  const serverCurrentPage =
    props.mode === "server" ? props.currentPage : undefined;
  const serverLoading = props.mode === "server" ? props.loading : undefined;
  const serverPageParamName =
    props.mode === "server" ? props.pageParamName : undefined;
  const serverSearchParamName =
    props.mode === "server" ? props.searchParamName : undefined;
  const serverSortParamName =
    props.mode === "server" ? props.sortParamName : undefined;
  const serverTotalPages =
    props.mode === "server" ? props.totalPages : undefined;
  const serverTotalRows = props.mode === "server" ? props.totalRows : undefined;
  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        columns
          .filter((column) => column.hidden)
          .map((column) => [column.id, false]),
      ),
    [columns],
  );
  const resolvedBasePath = serverBasePath ?? location.pathname;
  const [searchQuery, setSearchQuery] = useState(initialSearchValue);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    createColumnFilters(
      mergeBaseFacetedFilterValues(
        baseFacetedFilterValues,
        initialFacetedFilterValues,
      ),
    ),
  );
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>(
    initialSort
      ? [{ id: initialSort.columnId, desc: initialSort.direction === "desc" }]
      : [],
  );
  const lastAppliedSearchValueRef = useRef(initialSearchValue);
  const tableGlobalFilter =
    isServerMode || textFilterColumnId ? "" : searchQuery;
  const tablePagination = isServerMode
    ? {
        pageIndex: (serverCurrentPage ?? 1) - 1,
        pageSize: rows.length,
      }
    : pagination;

  useEffect(() => {
    setSearchQuery(initialSearchValue);
    lastAppliedSearchValueRef.current = initialSearchValue;
  }, [initialSearchValue]);

  useEffect(() => {
    setColumnFilters(
      createColumnFilters(
        mergeBaseFacetedFilterValues(
          baseFacetedFilterValues,
          initialFacetedFilterValues,
        ),
      ),
    );
  }, [baseFacetedFilterValues, initialFacetedFilterValues]);

  useEffect(() => {
    setSorting(
      initialSort
        ? [
            {
              id: initialSort.columnId,
              desc: initialSort.direction === "desc",
            },
          ]
        : [],
    );
  }, [initialSort?.columnId, initialSort?.direction]);

  const tableColumns = useMemo(
    () =>
      columns.map<ColumnDef<TData>>((column) => ({
        id: column.id,
        header: column.header,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: Boolean(column.sortValue),
        accessorFn: (row) =>
          column.sortValue?.(row) ?? column.filterValue?.(row),
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
        },
      })),
    [columns, isServerMode],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      columnFilters: isServerMode ? [] : columnFilters,
      columnVisibility,
      globalFilter: tableGlobalFilter,
      pagination: tablePagination,
      sorting,
    },
    onColumnFiltersChange: isServerMode ? undefined : setColumnFilters,
    onGlobalFilterChange: setSearchQuery,
    onPaginationChange: isServerMode ? undefined : setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: isServerMode ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isServerMode ? undefined : getPaginationRowModel(),
    getSortedRowModel: isServerMode ? undefined : getSortedRowModel(),
    getRowId: getRowKey,
    manualSorting: isServerMode,
    manualPagination: isServerMode,
    pageCount: serverTotalPages,
    globalFilterFn: (row, _columnId, filterValue) =>
      columns.some((column) => {
        const normalizedQuery = normalizeSearchValue(String(filterValue));

        if (normalizedQuery.length === 0) {
          return true;
        }

        const value = column.filterValue?.(row.original);

        return value
          ? normalizeSearchValue(value).includes(normalizedQuery)
          : false;
      }),
  });

  const filteredRows = isServerMode
    ? rows
    : table.getFilteredRowModel().rows.map((row) => row.original);
  const visibleRows = table.getRowModel().rows;
  const totalRows = isServerMode
    ? (serverTotalRows ?? rows.length)
    : table.getCoreRowModel().rows.length;
  const pageCount = isServerMode
    ? (serverTotalPages ?? 1)
    : table.getPageCount();
  const currentPage = isServerMode
    ? (serverCurrentPage ?? 1)
    : table.getState().pagination.pageIndex + 1;
  const isLoading =
    isServerMode &&
    (serverLoading ??
      (navigation.state !== "idle" &&
        navigation.location?.pathname === location.pathname &&
        navigation.location.search !== location.search));
  const serverSort = isServerMode ? sorting[0] : undefined;

  useEffect(() => {
    if (!isServerMode) {
      return;
    }

    if (searchQuery === lastAppliedSearchValueRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextHref = buildDataTableSearchHref({
        basePath: resolvedBasePath,
        currentSearch: location.search,
        pageParamName: serverPageParamName,
        searchParamName: serverSearchParamName,
        searchValue: searchQuery,
      });
      const currentHref = `${location.pathname}${location.search}`;

      lastAppliedSearchValueRef.current = searchQuery;

      if (nextHref !== currentHref) {
        void navigate(nextHref, { replace: true });
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isServerMode,
    location.pathname,
    location.search,
    navigate,
    resolvedBasePath,
    searchQuery,
    serverPageParamName,
    serverSearchParamName,
  ]);

  const setSearchFilter = (value: string) => {
    setSearchQuery(value);

    if (isServerMode) {
      return;
    }

    if (textFilterColumnId) {
      table.getColumn(textFilterColumnId)?.setFilterValue(value);
      return;
    }

    table.setGlobalFilter(value);
  };

  const clearSearchFilter = () => {
    setSearchFilter("");
  };

  const setClientFilterValue = (
    filter: DataTableFacetedFilter,
    values: DataTableFacetedFilterValue,
  ) => {
    table
      .getColumn(filter.columnId)
      ?.setFilterValue(
        mergeBaseFacetedFilterValue(
          baseFacetedFilterValues[filter.columnId],
          values,
        ),
      );
  };

  const setServerFilterValue = (
    filter: DataTableFacetedFilter,
    values: DataTableFacetedFilterValue,
  ) => {
    const nextFilters = mergeServerFilterValues(
      columnFilters,
      filter.columnId,
      values,
    );
    setColumnFilters(nextFilters);
    const nextHref = buildDataTableFilterHref({
      basePath: resolvedBasePath,
      currentSearch: location.search,
      filter,
      pageParamName: serverPageParamName,
      values,
    });
    const currentHref = `${location.pathname}${location.search}`;

    if (nextHref !== currentHref) {
      void navigate(nextHref);
    }
  };

  const setFacetedFilterValue = (
    filter: DataTableFacetedFilter,
    values: DataTableFacetedFilterValue,
  ) => {
    if (isServerMode) {
      setServerFilterValue(filter, values);
      return;
    }

    setClientFilterValue(filter, values);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="relative block sm:max-w-md sm:flex-1 lg:max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <span className="sr-only">Buscar en la tabla</span>
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder={searchPlaceholder}
              className="pr-8 pl-8"
            />
            {searchQuery.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={clearSearchFilter}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Limpiar búsqueda</span>
              </Button>
            ) : null}
          </label>
          {facetedFilters.length > 0 ? (
            <TooltipProvider>
              <div className="flex flex-wrap justify-end gap-2">
                {facetedFilters.map((filter) => (
                  <DataTableFacetedFilterControl
                    key={filter.columnId}
                    filter={filter}
                    selectedValues={getSelectedFilterValues(
                      table,
                      filter.columnId,
                      columnFilters,
                      isServerMode,
                      baseFacetedFilterValues,
                    )}
                    onChange={(values) => setFacetedFilterValue(filter, values)}
                  />
                ))}
              </div>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
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
                    {header.column.getCanSort() && isServerMode ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-sm"
                      >
                        <Link
                          to={buildDataTableSortHref({
                            basePath: resolvedBasePath,
                            columnId: header.column.id,
                            currentSearch: location.search,
                            direction: getNextServerSortDirection(
                              getServerSortDirection(
                                serverSort,
                                header.column.id,
                              ),
                            ),
                            pageParamName: serverPageParamName,
                            sortParamName: serverSortParamName,
                          })}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <SortIcon
                            direction={getServerSortDirection(
                              serverSort,
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
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredRows.length} de {totalRows}{" "}
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
          basePath={resolvedBasePath}
          pageCount={pageCount}
          currentPage={currentPage}
          canPreviousPage={
            isServerMode ? currentPage > 1 : table.getCanPreviousPage()
          }
          canNextPage={
            isServerMode ? currentPage < pageCount : table.getCanNextPage()
          }
          onPreviousPage={isServerMode ? undefined : () => table.previousPage()}
          onNextPage={isServerMode ? undefined : () => table.nextPage()}
          onPageChange={
            isServerMode ? undefined : (page) => table.setPageIndex(page - 1)
          }
          pageHrefBuilder={
            isServerMode
              ? (page) =>
                  buildDataTablePageHref({
                    basePath: resolvedBasePath,
                    currentSearch: location.search,
                    page,
                    pageParamName: serverPageParamName,
                  })
              : undefined
          }
        />
      </div>
    </div>
  );
}

function getSelectedFilterValues<TData>(
  table: ReturnType<typeof useReactTable<TData>>,
  columnId: string,
  columnFilters: ColumnFiltersState,
  isServerSide: boolean,
  baseFacetedFilterValues: Record<string, DataTableFacetedFilterValue>,
) {
  if (isServerSide) {
    const filter = columnFilters.find((entry) => entry.id === columnId)?.value;

    return isFacetedFilterValue(filter) ? filter : {};
  }

  const filterValue = table.getColumn(columnId)?.getFilterValue();

  if (!isFacetedFilterValue(filterValue)) {
    return {};
  }

  return getSelectedFacetedFilterValue(
    baseFacetedFilterValues[columnId],
    filterValue,
  );
}

function useOptionalNavigation() {
  try {
    return useNavigation();
  } catch {
    return { state: "idle" } as ReturnType<typeof useNavigation>;
  }
}
