import {
  getCoreRowModel,
  type ColumnFiltersState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigation } from "react-router";

import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
  createColumnFilters,
  getNextServerSortDirection,
  getServerSortDirection,
  isFacetedFilterValue,
  mergeBaseFacetedFilterValues,
  mergeServerFilterValues,
} from "@/components/shared/data-table-helpers";
import {
  createColumnVisibility,
  createDataTableColumns,
  createGlobalFilterFn,
  DataTableShell,
  emptyFacetedFilterValues,
} from "@/components/shared/data-table-core";
import type {
  DataTableFacetedFilterValue,
  ServerDataTableProps,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";

export function ServerDataTable<TData>({
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
  currentPage,
  totalPages,
  totalRows,
  basePath,
  initialSort,
  loading,
  pageParamName,
  searchParamName,
  sortParamName,
}: ServerDataTableProps<TData>) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useOptionalNavigation();
  const resolvedBasePath = basePath ?? location.pathname;
  const columnVisibility = useMemo(
    () => createColumnVisibility(columns),
    [columns],
  );
  const tableColumns = useMemo(
    () => createDataTableColumns(columns),
    [columns],
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
  const [sorting, setSorting] = useState<SortingState>(
    initialSort
      ? [{ id: initialSort.columnId, desc: initialSort.direction === "desc" }]
      : [],
  );
  const lastAppliedSearchValueRef = useRef(initialSearchValue);
  const serverSort = sorting[0];
  const isLoading =
    loading ??
    (navigation.state !== "idle" &&
      navigation.location?.pathname === location.pathname &&
      navigation.location.search !== location.search);

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

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      columnFilters: [],
      columnVisibility,
      globalFilter: "",
      pagination: {
        pageIndex: currentPage - 1,
        pageSize: rows.length,
      },
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowKey,
    manualSorting: true,
    manualPagination: true,
    pageCount: totalPages,
    globalFilterFn: createGlobalFilterFn(columns),
  });

  useEffect(() => {
    if (searchQuery === lastAppliedSearchValueRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextHref = buildDataTableSearchHref({
        basePath: resolvedBasePath,
        currentSearch: location.search,
        pageParamName,
        searchParamName,
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
    location.pathname,
    location.search,
    navigate,
    pageParamName,
    resolvedBasePath,
    searchParamName,
    searchQuery,
  ]);

  const setFacetedFilterValue = (values: DataTableFacetedFilterValue) => {
    const nextFilters = mergeServerFilterValues(
      columnFilters,
      dataTableFacetedFilterColumnId,
      values,
    );
    setColumnFilters(nextFilters);
    const nextHref = buildDataTableFilterHref({
      basePath: resolvedBasePath,
      currentSearch: location.search,
      groups: facetedFilters,
      pageParamName,
      values,
    });
    const currentHref = `${location.pathname}${location.search}`;

    if (nextHref !== currentHref) {
      void navigate(nextHref);
    }
  };

  const getSelectedFilterValues = (columnId: string) => {
    const filter = columnFilters.find((entry) => entry.id === columnId)?.value;

    return isFacetedFilterValue(filter) ? filter : {};
  };

  return (
    <DataTableShell
      table={table}
      columns={columns}
      getRowProps={getRowProps}
      searchPlaceholder={searchPlaceholder}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      facetedFilters={facetedFilters}
      getSelectedFilterValues={getSelectedFilterValues}
      onFacetedFilterChange={setFacetedFilterValue}
      emptyMessage={emptyMessage}
      basePath={resolvedBasePath}
      filteredRowCount={rows.length}
      totalRows={totalRows}
      isLoading={isLoading}
      pageCount={totalPages}
      currentPage={currentPage}
      canPreviousPage={currentPage > 1}
      canNextPage={currentPage < totalPages}
      pageHrefBuilder={(page) =>
        buildDataTablePageHref({
          basePath: resolvedBasePath,
          currentSearch: location.search,
          page,
          pageParamName,
        })
      }
      getServerSortHref={(columnId) =>
        buildDataTableSortHref({
          basePath: resolvedBasePath,
          columnId,
          currentSearch: location.search,
          direction: getNextServerSortDirection(
            getServerSortDirection(serverSort, columnId),
          ),
          pageParamName,
          sortParamName,
        })
      }
      getServerSortDirection={(columnId) =>
        getServerSortDirection(serverSort, columnId)
      }
    />
  );
}

function useOptionalNavigation() {
  try {
    return useNavigation();
  } catch {
    return { state: "idle" } as ReturnType<typeof useNavigation>;
  }
}
