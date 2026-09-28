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
import { dataTableSearchDebounceMs } from "@/components/shared/data-table.shared";
import {
  listQueryParamNames,
  parseListOrder,
  readListPage,
} from "@/lib/list-query/list-query";
import { useOptionalNavigation } from "@/lib/shared/forms";

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
}: {
  basePath: string;
  facetedFilters: DataTableFacetedFilter[];
  initialFacetedFilterValue: DataTableFacetedFilterValue;
  initialSearchValue?: string;
  initialSort?: DataTableSort;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const headingSearch = useDataTableHeadingSearch();
  const headingHref = `${location.pathname}${headingSearch}`;

  const replaceHref = (nextHref: string) => {
    if (nextHref === headingHref) {
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
          currentSearch: headingSearch,
          groups: facetedFilters,
          values,
        }),
      );
    },
    page: readListPage(new URLSearchParams(location.search)),
    setPage: (page: number) => {
      replaceHref(
        buildDataTablePageHref({
          basePath,
          currentSearch: headingSearch,
          page,
        }),
      );
    },
    search:
      new URLSearchParams(headingSearch).get(listQueryParamNames.search) ??
      initialSearchValue,
    setSearch: (searchValue: string) => {
      replaceHref(
        buildDataTableSearchHref({
          basePath,
          currentSearch: headingSearch,
          searchValue,
        }),
      );
    },
    // An order naming neither a column nor a direction —a hand-edited URL— is
    // the view's default order, as an absent one is.
    sort:
      parseListOrder(
        new URLSearchParams(location.search).get(listQueryParamNames.order),
      ) ?? initialSort,
    setSort: (sort: DataTableSort) => {
      replaceHref(
        buildDataTableSortHref({
          basePath,
          columnId: sort.columnId,
          currentSearch: headingSearch,
          direction: sort.direction,
        }),
      );
    },
  };
}

/**
 * The query string a list is heading to. The address bar only moves once the
 * loader answers, so while a navigation within the list is in flight its query
 * string is the one the next change has to be compared against and built on:
 * clearing a search still on its way has to cancel it, not lose to it, and a
 * search typed over a filter still on its way has to keep that filter.
 */
export function useDataTableHeadingSearch() {
  const location = useLocation();
  const navigation = useOptionalNavigation();

  return "location" in navigation &&
    navigation.location?.pathname === location.pathname
    ? navigation.location.search
    : location.search;
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
  // The setter closes over the current query string, so it changes on every
  // render; a ref keeps the debounce keyed on the typed value alone. The
  // recorded search is read through a ref for the same reason.
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;
  const searchRef = useRef(search);
  searchRef.current = search;

  // The query string records the search trimmed, so the typed value is the
  // authority on its surrounding spaces: a search arriving from the address bar
  // only replaces what the reader typed when it says something different, and
  // never trims a space they are still typing past.
  useEffect(() => {
    setSearchQuery((typedSearch) =>
      typedSearch.trim() === search ? typedSearch : search,
    );
  }, [search]);

  useEffect(() => {
    if (searchQuery.trim() === searchRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
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
