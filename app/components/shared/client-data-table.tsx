import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router";

import {
  createColumnFilters,
  getVisibleFacetedFilterValue,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValues,
} from "@/components/shared/data-table-helpers";
import {
  createColumnVisibility,
  createDataTableColumns,
  createGlobalFilterFn,
  emptyFacetedFilters,
  emptyFacetedFilterValues,
  useDataTableRowSelection,
} from "@/components/shared/data-table-core";
import { DataTableShell } from "@/components/shared/data-table-shell";
import type {
  ClientDataTableProps,
  DataTableFacetedFilterValue,
  DataTableSort,
} from "@/components/shared/data-table.shared";
import {
  dataTableFacetedFilterColumnId,
  defaultClientDataTablePageSize,
} from "@/components/shared/data-table.shared";
import {
  useDataTableUrlState,
  useDebouncedDataTableSearch,
} from "@/components/shared/data-table-url-state";

/** The fallback for a view that declares no initial faceted selection. */
const noFacetedFilterValue: DataTableFacetedFilterValue = {};

export function ClientDataTable<TData>(props: ClientDataTableProps<TData>) {
  const location = useLocation();
  const {
    baseFacetedFilterValues,
    emptyMessage,
    facetedFilters,
    initialFacetedFilterValues,
    initialSearchValue,
    pageSize,
    selectableRows,
  } = resolveClientDataTableDefaults(props);
  const { columnVisibility, tableColumns } = useClientDataTableColumns(
    props.columns,
    selectableRows,
  );
  // The address bar owns the search, the filters, the page and the order, so a
  // list URL renders the list as it was left and everything the reader does to
  // it is recorded.
  const {
    facetedFilterValue,
    setFacetedFilterValue,
    page,
    setPage,
    search,
    setSearch,
    sort,
    setSort,
  } = useDataTableUrlState({
    basePath: location.pathname,
    facetedFilters,
    initialFacetedFilterValue:
      initialFacetedFilterValues[dataTableFacetedFilterColumnId] ??
      noFacetedFilterValue,
    initialSearchValue,
    initialSort: props.initialSort,
    pageParamName: props.pageParamName,
    searchParamName: props.searchParamName,
    sortParamName: props.sortParamName,
  });
  const { searchQuery, setSearchQuery } = useDebouncedDataTableSearch({
    search,
    setSearch,
  });
  // The faceted selections come from the address bar, so a filtered list URL
  // renders filtered and a filter the reader picks is recorded straight away.
  const columnFilters: ColumnFiltersState = createColumnFilters(
    mergeBaseFacetedFilterValues(baseFacetedFilterValues, {
      ...initialFacetedFilterValues,
      [dataTableFacetedFilterColumnId]: facetedFilterValue,
    }),
  );
  const pagination = useMemo(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );
  // The order comes from the address bar too, so a list URL naming a sort
  // renders in that order and a column the reader clicks is recorded.
  const sorting: SortingState = sort
    ? [{ id: sort.columnId, desc: sort.direction === "desc" }]
    : [];
  const { rowSelection, setRowSelection } = useDataTableRowSelection({
    onSelectedRowIdsChange: props.onSelectedRowIdsChange,
    selectedRowIds: props.selectedRowIds,
  });

  const table = useClientReactTable({
    columnFilters,
    columnVisibility,
    columns: props.columns,
    getRowKey: props.getRowKey,
    pagination,
    rows: props.rows,
    rowSelection,
    searchQuery,
    selectableRows,
    setPage,
    setRowSelection,
    setSearchQuery,
    setSort,
    sorting,
    tableColumns,
    textFilterColumnId: props.textFilterColumnId,
  });
  const pageCount = table.getPageCount();

  // A page beyond the last one — reachable from a stale bookmark or a pasted
  // link — resolves to page one, so the reader sees rows instead of an empty
  // table.
  useEffect(() => {
    if (page > 1 && page > pageCount) {
      setPage(1);
    }
  }, [page, pageCount, setPage]);

  const getSelectedFilterValues = (columnId: string) => {
    const filterValue = table.getColumn(columnId)?.getFilterValue();

    if (!isFacetedFilterValue(filterValue)) {
      return {};
    }

    return getVisibleFacetedFilterValue(
      baseFacetedFilterValues[columnId],
      filterValue,
    );
  };

  return (
    <DataTableShell
      emptyMessage={emptyMessage}
      filters={{
        getSelectedValues: getSelectedFilterValues,
        groups: facetedFilters,
        onChange: setFacetedFilterValue,
      }}
      getRowProps={props.getRowProps}
      // Never loading: the rows are already here, so nothing the reader does to
      // this table waits on anything.
      isLoading={false}
      pagination={{
        basePath: location.pathname,
        canNextPage: table.getCanNextPage(),
        canPreviousPage: table.getCanPreviousPage(),
        currentPage: table.getState().pagination.pageIndex + 1,
        filteredRowCount: table.getFilteredRowModel().rows.length,
        hidden: props.hidePagination ?? false,
        onNextPage: () => table.nextPage(),
        onPageChange: (nextPage) => table.setPageIndex(nextPage - 1),
        onPreviousPage: () => table.previousPage(),
        pageCount,
        totalRows: table.getCoreRowModel().rows.length,
      }}
      search={{
        hidden: props.hideSearch ?? false,
        onChange: setSearchQuery,
        placeholder: props.searchPlaceholder,
        query: searchQuery,
      }}
      table={table}
    />
  );
}

/**
 * The optional props, resolved once. They are defaults and nothing else, so they
 * sit outside the component: read together they say what the table falls back
 * to, and read inside they were only noise between the hooks.
 */
function resolveClientDataTableDefaults<TData>(
  props: ClientDataTableProps<TData>,
) {
  return {
    baseFacetedFilterValues:
      props.baseFacetedFilterValues ?? emptyFacetedFilterValues,
    emptyMessage: props.emptyMessage ?? "No hay resultados para mostrar.",
    facetedFilters: props.facetedFilters ?? emptyFacetedFilters,
    initialFacetedFilterValues:
      props.initialFacetedFilterValues ?? emptyFacetedFilterValues,
    initialSearchValue: props.initialSearchValue ?? "",
    pageSize: props.pageSize ?? defaultClientDataTablePageSize,
    selectableRows: props.selectableRows ?? false,
  };
}

function useClientDataTableColumns<TData>(
  columns: ClientDataTableProps<TData>["columns"],
  selectableRows: boolean,
) {
  const columnVisibility = useMemo(
    () => createColumnVisibility(columns),
    [columns],
  );
  const tableColumns = useMemo(
    () => createDataTableColumns(columns, { selectableRows }),
    [columns, selectableRows],
  );

  return { columnVisibility, tableColumns };
}

function useClientReactTable<TData>({
  columnFilters,
  columnVisibility,
  columns,
  getRowKey,
  pagination,
  rows,
  rowSelection,
  searchQuery,
  selectableRows,
  setPage,
  setRowSelection,
  setSearchQuery,
  setSort,
  sorting,
  tableColumns,
  textFilterColumnId,
}: {
  columnFilters: ColumnFiltersState;
  columnVisibility: Record<string, boolean>;
  columns: ClientDataTableProps<TData>["columns"];
  getRowKey: ClientDataTableProps<TData>["getRowKey"];
  pagination: PaginationState;
  rows: TData[];
  rowSelection: RowSelectionState;
  searchQuery: string;
  selectableRows: boolean;
  setPage: (page: number) => void;
  setRowSelection: OnChangeFn<RowSelectionState>;
  setSearchQuery: (searchValue: string) => void;
  setSort: (sort: DataTableSort) => void;
  sorting: SortingState;
  tableColumns: ColumnDef<TData>[];
  textFilterColumnId?: string;
}): Table<TData> {
  // The text filter narrows one named column, so the global filter stays out of
  // the way; without one, the search box is the global filter. Either way it is
  // derived from the search rather than stored beside it, so a search arriving
  // from the address bar filters the rows the same way one the reader typed
  // does.
  const tableGlobalFilter = textFilterColumnId ? "" : searchQuery;
  const tableColumnFilters: ColumnFiltersState = textFilterColumnId
    ? [
        ...columnFilters.filter((filter) => filter.id !== textFilterColumnId),
        { id: textFilterColumnId, value: searchQuery },
      ]
    : columnFilters;

  return useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      columnFilters: tableColumnFilters,
      columnVisibility,
      globalFilter: tableGlobalFilter,
      pagination,
      rowSelection,
      sorting,
    },
    onGlobalFilterChange: setSearchQuery,
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;

      setPage(nextPagination.pageIndex + 1);
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const nextSort = getNextClientSort(sorting, updater);

      if (nextSort) {
        setSort(nextSort);
      }
    },
    enableRowSelection: selectableRows,
    // The address bar owns when the page resets: the shared href builders drop
    // the page whenever the search, the filters or the sort change. Left on,
    // the engine would also reset the page on its own and overwrite it.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowKey,
    globalFilterFn: createGlobalFilterFn(columns),
  });
}

/**
 * The engine cycles a column ascending, descending, then unsorted; the address
 * bar has nothing to write down for that third state, since an absent parameter
 * already means the view's default order. Landing on it is read as a request to
 * start the cycle over, so clicking a header alternates the two directions —
 * the way the server-paginated table already does.
 */
function getNextClientSort(
  sorting: SortingState,
  updater: Updater<SortingState>,
): DataTableSort | undefined {
  const nextSorting =
    typeof updater === "function" ? updater(sorting) : updater;
  const nextSort = nextSorting[0];

  if (nextSort) {
    return {
      columnId: nextSort.id,
      direction: nextSort.desc ? "desc" : "asc",
    };
  }

  const currentSort = sorting[0];

  // The flip is read off the current direction rather than fixed at ascending:
  // a numeric column cycles descending first, so a column already ascending
  // lands on unsorted and would otherwise be re-asserted ascending forever.
  return currentSort
    ? {
        columnId: currentSort.id,
        direction: currentSort.desc ? "asc" : "desc",
      }
    : undefined;
}
