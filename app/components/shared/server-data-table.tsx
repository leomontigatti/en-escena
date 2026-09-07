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
  getNextServerSortDirection,
  getServerSortDirection,
  isFacetedFilterValue,
  mergeServerFilterValues,
} from "@/components/shared/data-table-helpers";
import {
  createColumnVisibility,
  createDataTableColumns,
  createGlobalFilterFn,
  emptyFacetedFilters,
  emptyFacetedFilterValues,
  useDataTableColumnFiltersState,
  useDataTableRowSelection,
  useDataTableSortingState,
} from "@/components/shared/data-table-core";
import { DataTableShell } from "@/components/shared/data-table-shell";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  ServerDataTableProps,
} from "@/components/shared/data-table.shared";
import {
  dataTableFacetedFilterColumnId,
  dataTableSearchDebounceMs,
} from "@/components/shared/data-table.shared";

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
  const { clearSearchQuery, searchQuery, setSearchQuery } =
    useServerSearchQuery({
      applySearch: (searchValue) => {
        const nextHref = buildDataTableSearchHref({
          basePath: resolvedBasePath,
          currentSearch: location.search,
          pageParamName: props.pageParamName,
          searchParamName: props.searchParamName,
          searchValue,
        });

        if (nextHref !== currentHref) {
          void navigate(nextHref, { replace: true });
        }
      },
      initialSearchValue,
    });
  const { columnFilters, setColumnFilters } = useDataTableColumnFiltersState({
    baseFacetedFilterValues,
    initialFacetedFilterValues,
  });
  const { sorting, setSorting } = useDataTableSortingState(props.initialSort);
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

  return (
    <DataTableShell
      emptyMessage={emptyMessage}
      filters={{
        getSelectedValues: (columnId) =>
          getSelectedFilterValues(columnFilters, columnId),
        groups: facetedFilters,
        onChange: setFacetedFilterValue,
      }}
      getRowProps={props.getRowProps}
      isLoading={isLoading}
      pagination={{
        basePath: resolvedBasePath,
        canNextPage: props.currentPage < props.totalPages,
        canPreviousPage: props.currentPage > 1,
        currentPage: props.currentPage,
        // The page the loader sent, against the whole set it was drawn from:
        // there is no client-side filtering to narrow either number.
        filteredRowCount: props.rows.length,
        hrefBuilder: createServerPageHrefBuilder({
          currentSearch: location.search,
          pageParamName: props.pageParamName,
          resolvedBasePath,
        }),
        pageCount: props.totalPages,
        totalRows: props.totalRows,
      }}
      search={{
        onChange: setSearchQuery,
        onClear: clearSearchQuery,
        placeholder: props.searchPlaceholder,
        query: searchQuery,
      }}
      // Present, and that is what makes the headers sort by link: this table's
      // sort is a URL the reader can share and go back to.
      serverSort={{
        getDirection: (columnId) =>
          getServerSortDirection(serverSort, columnId),
        getHref: createServerSortHrefBuilder({
          currentSearch: location.search,
          pageParamName: props.pageParamName,
          resolvedBasePath,
          serverSort,
          sortParamName: props.sortParamName,
        }),
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

/**
 * The search box's state for a server-paginated table: the reader's keystrokes
 * land in the box at once and reach the loader debounced, through the URL.
 *
 * The loader answers the keystroke that asked for it long after it was typed,
 * and by then the reader has usually typed on. So a search arriving from the
 * address bar only replaces what is in the box when it did not come from here:
 * every search this hook navigates with is queued, and an arriving one found in
 * the queue is its own echo, which the box ignores. Anything else — Back, a
 * shared link, a view resetting its filters — is an outside change, and the box
 * adopts it.
 */
function useServerSearchQuery({
  applySearch,
  initialSearchValue,
}: {
  applySearch: (searchValue: string) => void;
  initialSearchValue: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearchValue);
  // `applySearch` closes over the current URL, so it changes on every render; a
  // ref keeps the debounce keyed on the typed value alone.
  const applySearchRef = useRef(applySearch);
  applySearchRef.current = applySearch;
  // The searches navigated with and not yet echoed back, oldest first, and the
  // one the address bar is expected to hold once they all land. The URL records
  // the search trimmed, so both are trimmed too.
  const pendingSearchValuesRef = useRef<string[]>([]);
  const targetSearchValueRef = useRef(initialSearchValue.trim());

  useEffect(() => {
    const echoIndex =
      pendingSearchValuesRef.current.indexOf(initialSearchValue);

    if (echoIndex >= 0) {
      // Ours, along with any earlier one a later navigation interrupted before
      // its loader could answer.
      pendingSearchValuesRef.current = pendingSearchValuesRef.current.slice(
        echoIndex + 1,
      );
      return;
    }

    pendingSearchValuesRef.current = [];
    targetSearchValueRef.current = initialSearchValue;
    setSearchQuery(initialSearchValue);
  }, [initialSearchValue]);

  // The typed value is the authority on its own surrounding spaces, so a search
  // already recorded trimmed is not navigated with again for a space the reader
  // is still typing past.
  useEffect(() => {
    if (searchQuery.trim() === targetSearchValueRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      applyServerSearch({
        applySearchRef,
        pendingSearchValuesRef,
        searchValue: searchQuery,
        targetSearchValueRef,
      });
    }, dataTableSearchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  return {
    // Clearing is a decision, not a pause in typing: it reaches the loader
    // without waiting out the debounce.
    clearSearchQuery: () => {
      setSearchQuery("");
      applyServerSearch({
        applySearchRef,
        pendingSearchValuesRef,
        searchValue: "",
        targetSearchValueRef,
      });
    },
    searchQuery,
    setSearchQuery,
  };
}

function applyServerSearch({
  applySearchRef,
  pendingSearchValuesRef,
  searchValue,
  targetSearchValueRef,
}: {
  applySearchRef: { current: (searchValue: string) => void };
  pendingSearchValuesRef: { current: string[] };
  searchValue: string;
  targetSearchValueRef: { current: string };
}) {
  const recordedSearchValue = searchValue.trim();

  if (recordedSearchValue === targetSearchValueRef.current) {
    return;
  }

  targetSearchValueRef.current = recordedSearchValue;
  pendingSearchValuesRef.current = [
    ...pendingSearchValuesRef.current,
    recordedSearchValue,
  ];
  applySearchRef.current(searchValue);
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
