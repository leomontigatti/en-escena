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
  useReactTable,
} from "@tanstack/react-table";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router";

import {
  getVisibleFacetedFilterValue,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValue,
} from "@/components/shared/data-table-helpers";
import {
  createColumnVisibility,
  createDataTableColumns,
  createGlobalFilterFn,
  emptyFacetedFilters,
  emptyFacetedFilterValues,
  useDataTableColumnFiltersState,
  useDataTableRowSelection,
  useDataTableSearchQueryState,
  useDataTableSortingState,
} from "@/components/shared/data-table-core";
import { DataTableShell } from "@/components/shared/data-table-shell";
import type {
  ClientDataTableProps,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import {
  dataTableFacetedFilterColumnId,
  defaultClientDataTablePageSize,
} from "@/components/shared/data-table.shared";

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
  const { searchQuery, setSearchQuery } =
    useDataTableSearchQueryState(initialSearchValue);
  const { columnFilters, setColumnFilters } = useDataTableColumnFiltersState({
    baseFacetedFilterValues,
    initialFacetedFilterValues,
  });
  const { pagination, setPagination } = usePaginationState(pageSize);
  const { sorting, setSorting } = useDataTableSortingState(props.initialSort);
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
    selectableRows,
    setColumnFilters,
    setPagination,
    setRowSelection,
    setSearchQuery,
    setSorting,
    sorting,
    tableColumns,
    // The text filter narrows one named column, so the global filter stays out
    // of the way; without one, the search box is the global filter.
    tableGlobalFilter: props.textFilterColumnId ? "" : searchQuery,
  });
  const { getSelectedFilterValues, setFacetedFilterValue, setSearchFilter } =
    createClientFilterHandlers({
      baseFacetedFilterValues,
      setSearchQuery,
      table,
      textFilterColumnId: props.textFilterColumnId,
    });

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
        onPageChange: (page) => table.setPageIndex(page - 1),
        onPreviousPage: () => table.previousPage(),
        pageCount: table.getPageCount(),
        totalRows: table.getCoreRowModel().rows.length,
      }}
      search={{
        hidden: props.hideSearch ?? false,
        onChange: setSearchFilter,
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

/**
 * The page the reader is on, and how many rows fit on it. A change of page size
 * goes back to the first page: the position they were on belongs to a
 * pagination that no longer exists.
 */
function usePaginationState(pageSize: number) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  useEffect(() => {
    setPagination({ pageIndex: 0, pageSize });
  }, [pageSize]);

  return { pagination, setPagination };
}

function useClientReactTable<TData>({
  columnFilters,
  columnVisibility,
  columns,
  getRowKey,
  pagination,
  rows,
  rowSelection,
  selectableRows,
  setColumnFilters,
  setPagination,
  setRowSelection,
  setSearchQuery,
  setSorting,
  sorting,
  tableColumns,
  tableGlobalFilter,
}: {
  columnFilters: ColumnFiltersState;
  columnVisibility: Record<string, boolean>;
  columns: ClientDataTableProps<TData>["columns"];
  getRowKey: ClientDataTableProps<TData>["getRowKey"];
  pagination: PaginationState;
  rows: TData[];
  rowSelection: RowSelectionState;
  selectableRows: boolean;
  setColumnFilters: OnChangeFn<ColumnFiltersState>;
  setPagination: OnChangeFn<PaginationState>;
  setRowSelection: OnChangeFn<RowSelectionState>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSorting: OnChangeFn<SortingState>;
  sorting: SortingState;
  tableColumns: ColumnDef<TData>[];
  tableGlobalFilter: string;
}) {
  return useReactTable({
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
}

/**
 * The three handlers that write through the table rather than through state:
 * they need the built table, so they are made after it and not before.
 */
function createClientFilterHandlers<TData>({
  baseFacetedFilterValues,
  setSearchQuery,
  table,
  textFilterColumnId,
}: {
  baseFacetedFilterValues: Record<string, DataTableFacetedFilterValue>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  table: Table<TData>;
  textFilterColumnId?: string;
}) {
  return {
    getSelectedFilterValues: (columnId: string) => {
      const filterValue = table.getColumn(columnId)?.getFilterValue();

      if (!isFacetedFilterValue(filterValue)) {
        return {};
      }

      return getVisibleFacetedFilterValue(
        baseFacetedFilterValues[columnId],
        filterValue,
      );
    },
    setFacetedFilterValue: (values: DataTableFacetedFilterValue) => {
      table
        .getColumn(dataTableFacetedFilterColumnId)
        ?.setFilterValue(
          mergeBaseFacetedFilterValue(
            baseFacetedFilterValues[dataTableFacetedFilterColumnId],
            values,
          ),
        );
    },
    setSearchFilter: (value: string) => {
      setSearchQuery(value);

      if (textFilterColumnId) {
        table.getColumn(textFilterColumnId)?.setFilterValue(value);
        return;
      }

      table.setGlobalFilter(value);
    },
  };
}
