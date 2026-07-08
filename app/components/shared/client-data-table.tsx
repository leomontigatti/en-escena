import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
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
  initialSort,
}: ClientDataTableProps<TData>) {
  const location = useLocation();
  const columnVisibility = useMemo(
    () => createColumnVisibility(columns),
    [columns],
  );
  const tableColumns = useMemo(
    () => createDataTableColumns(columns, { selectableRows }),
    [columns, selectableRows],
  );
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const tableGlobalFilter = textFilterColumnId ? "" : searchQuery;

  useEffect(() => {
    setSearchQuery(initialSearchValue);
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

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      columnFilters,
      columnVisibility,
      globalFilter: tableGlobalFilter,
      pagination,
      rowSelection,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearchQuery,
    onPaginationChange: setPagination,
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

  const setSearchFilter = (value: string) => {
    setSearchQuery(value);

    if (textFilterColumnId) {
      table.getColumn(textFilterColumnId)?.setFilterValue(value);
      return;
    }

    table.setGlobalFilter(value);
  };

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
      onSearchChange={setSearchFilter}
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
