import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
} from "@/components/shared/data-table-helpers";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableSort,
} from "@/components/shared/data-table.shared";
import {
  dataTablePageParamName,
  dataTableSearchParamName,
  dataTableSortParamName,
} from "@/components/shared/data-table.shared";

/**
 * Long enough that a reader still typing writes nothing, short enough that the
 * address bar settles as soon as they stop. Matches the server-paginated table.
 */
const dataTableSearchDebounceMs = 300;

/**
 * The mapping between a browser-paginated list's state and the query string.
 * The address bar is the source of truth: the list reads its state from there
 * and writes it back, so leaving the list and coming back — with Back, a
 * reload or a shared link — shows the list as it was left.
 *
 * Writes replace the current history entry instead of pushing one. The list is
 * moving through rows the browser already holds, so pushing would turn Back
 * into a page-by-page rewind instead of a way out of the list.
 */
export function useDataTableUrlState({
  basePath,
  facetedFilters,
  initialFacetedFilterValue,
  initialSearchValue = "",
  initialSort,
  pageParamName = dataTablePageParamName,
  searchParamName = dataTableSearchParamName,
  sortParamName = dataTableSortParamName,
}: {
  basePath: string;
  facetedFilters: DataTableFacetedFilter[];
  initialFacetedFilterValue: DataTableFacetedFilterValue;
  initialSearchValue?: string;
  initialSort?: DataTableSort;
  pageParamName?: string;
  searchParamName?: string;
  sortParamName?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentHref = `${location.pathname}${location.search}`;

  const replaceHref = (nextHref: string) => {
    if (nextHref === currentHref) {
      return;
    }

    void navigate(nextHref, { preventScrollReset: true, replace: true });
  };

  return {
    facetedFilterValue: readDataTableFacetedFilterValue(
      location.search,
      facetedFilters,
      initialFacetedFilterValue,
    ),
    setFacetedFilterValue: (values: DataTableFacetedFilterValue) => {
      replaceHref(
        buildDataTableFilterHref({
          basePath,
          currentSearch: location.search,
          groups: facetedFilters,
          pageParamName,
          values,
        }),
      );
    },
    page: readDataTablePage(location.search, pageParamName),
    setPage: (page: number) => {
      replaceHref(
        buildDataTablePageHref({
          basePath,
          currentSearch: location.search,
          page,
          pageParamName,
        }),
      );
    },
    search:
      new URLSearchParams(location.search).get(searchParamName) ??
      initialSearchValue,
    setSearch: (searchValue: string) => {
      replaceHref(
        buildDataTableSearchHref({
          basePath,
          currentSearch: location.search,
          pageParamName,
          searchParamName,
          searchValue,
        }),
      );
    },
    sort: readDataTableSort(location.search, sortParamName) ?? initialSort,
    setSort: (sort: DataTableSort) => {
      replaceHref(
        buildDataTableSortHref({
          basePath,
          columnId: sort.columnId,
          currentSearch: location.search,
          direction: sort.direction,
          pageParamName,
          sortParamName,
        }),
      );
    },
  };
}

/**
 * The search text lives in local state as well as in the query string: typing
 * filters the rows straight away, and the address bar catches up once the
 * reader stops, so a search leaves one history entry instead of a trail of
 * half-typed ones.
 */
export function useDebouncedDataTableSearch({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (searchValue: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState(search);
  const lastWrittenSearchRef = useRef(search);
  // The setter closes over the current query string, so it changes on every
  // render; a ref keeps the debounce keyed on the typed value alone.
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;

  useEffect(() => {
    setSearchQuery(search);
    lastWrittenSearchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (searchQuery === lastWrittenSearchRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastWrittenSearchRef.current = searchQuery;
      setSearchRef.current(searchQuery);
    }, dataTableSearchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  return { searchQuery, setSearchQuery };
}

/**
 * Each filter group reads its selection from its own query parameter, named by
 * the group id. A view's initial value is the fallback for a group the query
 * string says nothing about.
 */
function readDataTableFacetedFilterValue(
  currentSearch: string,
  groups: DataTableFacetedFilter[],
  initialValue: DataTableFacetedFilterValue,
) {
  const searchParams = new URLSearchParams(currentSearch);
  const values: DataTableFacetedFilterValue = { ...initialValue };

  for (const group of groups) {
    const value = searchParams.get(group.id);

    if (value === null) {
      continue;
    }

    if (value.length > 0) {
      values[group.id] = value;
    } else {
      delete values[group.id];
    }
  }

  return values;
}

/**
 * The sort travels as a column and direction pair. A parameter naming neither
 * — from a hand-edited URL — means the same as an absent one: the view's
 * default order.
 */
function readDataTableSort(currentSearch: string, sortParamName: string) {
  const rawSort = new URLSearchParams(currentSearch).get(sortParamName);

  if (!rawSort) {
    return undefined;
  }

  const separatorIndex = rawSort.lastIndexOf(":");
  const columnId = rawSort.slice(0, separatorIndex);
  const direction = rawSort.slice(separatorIndex + 1);

  if (columnId.length === 0 || (direction !== "asc" && direction !== "desc")) {
    return undefined;
  }

  return { columnId, direction } satisfies DataTableSort;
}

function readDataTablePage(
  currentSearch: string,
  pageParamName = dataTablePageParamName,
) {
  const rawPage = new URLSearchParams(currentSearch).get(pageParamName);
  const page = Number(rawPage);

  return Number.isInteger(page) && page >= 1 ? page : 1;
}
