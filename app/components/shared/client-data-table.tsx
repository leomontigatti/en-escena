import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
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
  DataTableShell,
  emptyFacetedFilterValues,
} from "@/components/shared/data-table-core";
import type {
  ClientDataTableProps,
  DataTableFacetedFilterValue,
  DataTableSort,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";
import {
  useDataTableUrlState,
  useDebouncedDataTableSearch,
} from "@/components/shared/data-table-url-state";

const clientDataTablePageSize = 10;

/** The fallback for a view that declares no initial faceted selection. */
const noFacetedFilterValue: DataTableFacetedFilterValue = {};

export function ClientDataTable<TData>({
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
  textFilterColumnId,
  selectableRows = false,
  selectedRowIds,
  onSelectedRowIdsChange,
  hideSearch = false,
  hidePagination = false,
  initialSort,
  pageParamName,
  searchParamName,
  sortParamName,
}: ClientDataTableProps<TData>) {
  const location = useLocation();
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
    initialSort,
    pageParamName,
    searchParamName,
    sortParamName,
  });
  const { searchQuery, setSearchQuery } = useDebouncedDataTableSearch({
    search,
    setSearch,
  });
  const columnVisibility = useMemo(
    () => createColumnVisibility(columns),
    [columns],
  );
  const tableColumns = useMemo(
    () => createDataTableColumns(columns, { selectableRows }),
    [columns, selectableRows],
  );
  // The faceted selections come from the address bar, so a filtered list URL
  // renders filtered and a filter the reader picks is recorded straight away.
  const columnFilters: ColumnFiltersState = createColumnFilters(
    mergeBaseFacetedFilterValues(baseFacetedFilterValues, {
      ...initialFacetedFilterValues,
      [dataTableFacetedFilterColumnId]: facetedFilterValue,
    }),
  );
  const pagination = useMemo(
    () => ({ pageIndex: page - 1, pageSize: clientDataTablePageSize }),
    [page],
  );
  // The order comes from the address bar too, so a list URL naming a sort
  // renders in that order and a column the reader clicks is recorded.
  const sorting: SortingState = sort
    ? [{ id: sort.columnId, desc: sort.direction === "desc" }]
    : [];
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
  const tableGlobalFilter = textFilterColumnId ? "" : searchQuery;
  // The text filter is derived from the search rather than stored beside it, so
  // a search arriving from the address bar filters the rows the same way one
  // the reader typed does.
  const tableColumnFilters: ColumnFiltersState = textFilterColumnId
    ? [
        ...columnFilters.filter((filter) => filter.id !== textFilterColumnId),
        { id: textFilterColumnId, value: searchQuery },
      ]
    : columnFilters;

  const table = useReactTable({
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
      table={table}
      getRowProps={getRowProps}
      searchPlaceholder={searchPlaceholder}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      hideSearch={hideSearch}
      hidePagination={hidePagination}
      facetedFilters={facetedFilters}
      getSelectedFilterValues={getSelectedFilterValues}
      onFacetedFilterChange={setFacetedFilterValue}
      emptyMessage={emptyMessage}
      basePath={location.pathname}
      filteredRowCount={table.getFilteredRowModel().rows.length}
      totalRows={table.getCoreRowModel().rows.length}
      isLoading={false}
      pageCount={table.getPageCount()}
      currentPage={table.getState().pagination.pageIndex + 1}
      canPreviousPage={table.getCanPreviousPage()}
      canNextPage={table.getCanNextPage()}
      onPreviousPage={() => table.previousPage()}
      onNextPage={() => table.nextPage()}
      onPageChange={(page) => table.setPageIndex(page - 1)}
    />
  );
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

  return currentSort
    ? { columnId: currentSort.id, direction: "asc" }
    : undefined;
}
