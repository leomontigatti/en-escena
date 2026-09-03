import {
  getCoreRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  useDataTableRowSelection,
} from "@/components/shared/data-table-core";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  ServerDataTableProps,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";

export function ServerDataTable<TData>(props: ServerDataTableProps<TData>) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useOptionalNavigation();
  const {
    baseFacetedFilterValues,
    emptyMessage,
    facetedFilters,
    initialFacetedFilterValues,
    initialSearchValue,
    resolvedBasePath,
    selectableRows,
  } = resolveServerDataTableDefaults(props, location.pathname);
  const currentHref = `${location.pathname}${location.search}`;
  const { columnVisibility, tableColumns } = useServerDataTableColumns(
    props.columns,
    selectableRows,
  );
  const { rowSelection, setRowSelection } = useDataTableRowSelection({
    onSelectedRowIdsChange: props.onSelectedRowIdsChange,
    selectedRowIds: props.selectedRowIds,
  });
  const { searchQuery, setSearchQuery, lastAppliedSearchValueRef } =
    useSearchQueryState(initialSearchValue);
  const { columnFilters, setColumnFilters } = useColumnFiltersState({
    baseFacetedFilterValues,
    initialFacetedFilterValues,
  });
  const { sorting, setSorting } = useSortingState(props.initialSort);
  const serverSort = sorting[0];

  const table = useServerReactTable({
    columnVisibility,
    columns: props.columns,
    currentPage: props.currentPage,
    getRowKey: props.getRowKey,
    rows: props.rows,
    rowSelection,
    selectableRows,
    setRowSelection,
    setSorting,
    sorting,
    tableColumns,
    totalPages: props.totalPages,
  });
  const isLoading = getServerTableLoading({
    loading: props.loading,
    location,
    navigation,
  });
  const setFacetedFilterValue = createServerFacetedFilterHandler({
    columnFilters,
    currentHref,
    currentSearch: location.search,
    facetedFilters,
    navigate,
    pageParamName: props.pageParamName,
    resolvedBasePath,
    setColumnFilters,
  });

  useServerSearchNavigation({
    currentHref,
    currentSearch: location.search,
    lastAppliedSearchValueRef,
    navigate,
    pageParamName: props.pageParamName,
    resolvedBasePath,
    searchParamName: props.searchParamName,
    searchQuery,
  });

  return (
    <DataTableShell
      table={table}
      getRowProps={props.getRowProps}
      searchPlaceholder={props.searchPlaceholder}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      facetedFilters={facetedFilters}
      getSelectedFilterValues={(columnId) =>
        getSelectedFilterValues(columnFilters, columnId)
      }
      onFacetedFilterChange={setFacetedFilterValue}
      emptyMessage={emptyMessage}
      basePath={resolvedBasePath}
      filteredRowCount={props.rows.length}
      totalRows={props.totalRows}
      isLoading={isLoading}
      pageCount={props.totalPages}
      currentPage={props.currentPage}
      canPreviousPage={props.currentPage > 1}
      canNextPage={props.currentPage < props.totalPages}
      pageHrefBuilder={createServerPageHrefBuilder({
        currentSearch: location.search,
        pageParamName: props.pageParamName,
        resolvedBasePath,
      })}
      getServerSortHref={createServerSortHrefBuilder({
        currentSearch: location.search,
        pageParamName: props.pageParamName,
        resolvedBasePath,
        serverSort,
        sortParamName: props.sortParamName,
      })}
      getServerSortDirection={(columnId) =>
        getServerSortDirection(serverSort, columnId)
      }
    />
  );
}

/**
 * The optional props, resolved once. They are defaults and nothing else, so they
 * sit outside the component: read together they say what the table falls back
 * to, and read inside they were only noise between the hooks.
 */
function resolveServerDataTableDefaults<TData>(
  props: ServerDataTableProps<TData>,
  currentPathname: string,
) {
  return {
    baseFacetedFilterValues:
      props.baseFacetedFilterValues ?? emptyFacetedFilterValues,
    emptyMessage: props.emptyMessage ?? "No hay resultados para mostrar.",
    facetedFilters: props.facetedFilters ?? emptyFacetedFilters,
    initialFacetedFilterValues:
      props.initialFacetedFilterValues ?? emptyFacetedFilterValues,
    initialSearchValue: props.initialSearchValue ?? "",
    resolvedBasePath: props.basePath ?? currentPathname,
    selectableRows: props.selectableRows ?? false,
  };
}

// A stable identity: the resolver runs on every render, and a fresh `[]` would
// make every effect that reads the filters treat "no filters" as a change.
const emptyFacetedFilters: DataTableFacetedFilter[] = [];

function useServerDataTableColumns<TData>(
  columns: ServerDataTableProps<TData>["columns"],
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

function useSearchQueryState(initialSearchValue: string) {
  const [searchQuery, setSearchQuery] = useState(initialSearchValue);
  const lastAppliedSearchValueRef = useRef(initialSearchValue);

  useEffect(() => {
    setSearchQuery(initialSearchValue);
    lastAppliedSearchValueRef.current = initialSearchValue;
  }, [initialSearchValue]);

  return { searchQuery, setSearchQuery, lastAppliedSearchValueRef };
}

function useColumnFiltersState({
  baseFacetedFilterValues,
  initialFacetedFilterValues,
}: {
  baseFacetedFilterValues: Record<string, DataTableFacetedFilterValue>;
  initialFacetedFilterValues: Record<string, DataTableFacetedFilterValue>;
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    createServerColumnFilters(
      baseFacetedFilterValues,
      initialFacetedFilterValues,
    ),
  );

  useEffect(() => {
    setColumnFilters(
      createServerColumnFilters(
        baseFacetedFilterValues,
        initialFacetedFilterValues,
      ),
    );
  }, [baseFacetedFilterValues, initialFacetedFilterValues]);

  return { columnFilters, setColumnFilters };
}

function createServerColumnFilters(
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

function useSortingState(
  initialSort: ServerDataTableProps<unknown>["initialSort"],
) {
  const [sorting, setSorting] = useState<SortingState>(() =>
    createServerSortingState(initialSort),
  );

  useEffect(() => {
    setSorting(createServerSortingState(initialSort));
  }, [initialSort?.columnId, initialSort?.direction]);

  return { sorting, setSorting };
}

function createServerSortingState(
  initialSort: ServerDataTableProps<unknown>["initialSort"],
): SortingState {
  if (!initialSort) {
    return [];
  }

  return [
    {
      id: initialSort.columnId,
      desc: initialSort.direction === "desc",
    },
  ];
}

function useServerReactTable<TData>({
  columnVisibility,
  columns,
  currentPage,
  getRowKey,
  rows,
  rowSelection,
  selectableRows,
  setRowSelection,
  setSorting,
  sorting,
  tableColumns,
  totalPages,
}: {
  columnVisibility: Record<string, boolean>;
  columns: ServerDataTableProps<TData>["columns"];
  currentPage: number;
  getRowKey: ServerDataTableProps<TData>["getRowKey"];
  rows: TData[];
  rowSelection: RowSelectionState;
  selectableRows: boolean;
  setRowSelection: OnChangeFn<RowSelectionState>;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  sorting: SortingState;
  tableColumns: ColumnDef<TData>[];
  totalPages: number;
}) {
  return useReactTable({
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
      rowSelection,
      sorting,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    enableRowSelection: selectableRows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowKey,
    manualSorting: true,
    manualPagination: true,
    pageCount: totalPages,
    globalFilterFn: createGlobalFilterFn(columns),
  });
}

function useServerSearchNavigation({
  currentHref,
  currentSearch,
  lastAppliedSearchValueRef,
  navigate,
  pageParamName,
  resolvedBasePath,
  searchParamName,
  searchQuery,
}: {
  currentHref: string;
  currentSearch: string;
  lastAppliedSearchValueRef: { current: string };
  navigate: ReturnType<typeof useNavigate>;
  pageParamName?: string;
  resolvedBasePath: string;
  searchParamName?: string;
  searchQuery: string;
}) {
  useEffect(() => {
    if (searchQuery === lastAppliedSearchValueRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextHref = buildDataTableSearchHref({
        basePath: resolvedBasePath,
        currentSearch,
        pageParamName,
        searchParamName,
        searchValue: searchQuery,
      });

      lastAppliedSearchValueRef.current = searchQuery;

      if (nextHref !== currentHref) {
        void navigate(nextHref, { replace: true });
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    currentHref,
    currentSearch,
    lastAppliedSearchValueRef,
    navigate,
    pageParamName,
    resolvedBasePath,
    searchParamName,
    searchQuery,
  ]);
}

function createServerFacetedFilterHandler({
  columnFilters,
  currentHref,
  currentSearch,
  facetedFilters,
  navigate,
  pageParamName,
  resolvedBasePath,
  setColumnFilters,
}: {
  columnFilters: ColumnFiltersState;
  currentHref: string;
  currentSearch: string;
  facetedFilters: DataTableFacetedFilter[];
  navigate: ReturnType<typeof useNavigate>;
  pageParamName?: string;
  resolvedBasePath: string;
  setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>;
}) {
  return (values: DataTableFacetedFilterValue) => {
    const nextFilters = mergeServerFilterValues(
      columnFilters,
      dataTableFacetedFilterColumnId,
      values,
    );
    setColumnFilters(nextFilters);
    const nextHref = buildDataTableFilterHref({
      basePath: resolvedBasePath,
      currentSearch,
      groups: facetedFilters,
      pageParamName,
      values,
    });

    if (nextHref !== currentHref) {
      void navigate(nextHref);
    }
  };
}

function getSelectedFilterValues(
  columnFilters: ColumnFiltersState,
  columnId: string,
) {
  const filter = columnFilters.find((entry) => entry.id === columnId)?.value;

  return isFacetedFilterValue(filter) ? filter : {};
}

function getServerTableLoading({
  loading,
  location,
  navigation,
}: {
  loading?: boolean;
  location: ReturnType<typeof useLocation>;
  navigation: ReturnType<typeof useNavigation>;
}) {
  if (loading !== undefined) {
    return loading;
  }

  return (
    navigation.state !== "idle" &&
    navigation.location?.pathname === location.pathname &&
    navigation.location.search !== location.search
  );
}

function createServerPageHrefBuilder({
  currentSearch,
  pageParamName,
  resolvedBasePath,
}: {
  currentSearch: string;
  pageParamName?: string;
  resolvedBasePath: string;
}) {
  return (page: number) =>
    buildDataTablePageHref({
      basePath: resolvedBasePath,
      currentSearch,
      page,
      pageParamName,
    });
}

function createServerSortHrefBuilder({
  currentSearch,
  pageParamName,
  resolvedBasePath,
  serverSort,
  sortParamName,
}: {
  currentSearch: string;
  pageParamName?: string;
  resolvedBasePath: string;
  serverSort: SortingState[number] | undefined;
  sortParamName?: string;
}) {
  return (columnId: string) =>
    buildDataTableSortHref({
      basePath: resolvedBasePath,
      columnId,
      currentSearch,
      direction: getNextServerSortDirection(
        getServerSortDirection(serverSort, columnId),
      ),
      pageParamName,
      sortParamName,
    });
}

function useOptionalNavigation() {
  try {
    return useNavigation();
  } catch {
    return { state: "idle" } as ReturnType<typeof useNavigation>;
  }
}
