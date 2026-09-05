import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

import {
  createColumnFilters,
  getVisibleFacetedFilterValue,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValue,
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
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";
import {
  useDataTableUrlState,
  useDebouncedDataTableSearch,
} from "@/components/shared/data-table-url-state";

const clientDataTablePageSize = 10;

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
}: ClientDataTableProps<TData>) {
  const location = useLocation();
  const { page, setPage, search, setSearch } = useDataTableUrlState({
    basePath: location.pathname,
    initialSearchValue,
    pageParamName,
    searchParamName,
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    createColumnFilters(
      mergeBaseFacetedFilterValues(
        baseFacetedFilterValues,
        initialFacetedFilterValues,
      ),
    ),
  );
  const pagination = useMemo(
    () => ({ pageIndex: page - 1, pageSize: clientDataTablePageSize }),
    [page],
  );
  const [sorting, setSorting] = useState<SortingState>(
    initialSort
      ? [{ id: initialSort.columnId, desc: initialSort.direction === "desc" }]
      : [],
  );
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
  const tableColumnFilters = useMemo(() => {
    if (!textFilterColumnId) {
      return columnFilters;
    }

    return [
      ...columnFilters.filter((filter) => filter.id !== textFilterColumnId),
      { id: textFilterColumnId, value: searchQuery },
    ];
  }, [columnFilters, searchQuery, textFilterColumnId]);

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
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearchQuery,
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;

      setPage(nextPagination.pageIndex + 1);
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    enableRowSelection: selectableRows,
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

  const setFacetedFilterValue = (values: DataTableFacetedFilterValue) => {
    table
      .getColumn(dataTableFacetedFilterColumnId)
      ?.setFilterValue(
        mergeBaseFacetedFilterValue(
          baseFacetedFilterValues[dataTableFacetedFilterColumnId],
          values,
        ),
      );
  };

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
