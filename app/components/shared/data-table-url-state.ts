import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  buildDataTablePageHref,
  buildDataTableSearchHref,
} from "@/components/shared/data-table-helpers";
import {
  dataTablePageParamName,
  dataTableSearchParamName,
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
  initialSearchValue = "",
  pageParamName = dataTablePageParamName,
  searchParamName = dataTableSearchParamName,
}: {
  basePath: string;
  initialSearchValue?: string;
  pageParamName?: string;
  searchParamName?: string;
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

function readDataTablePage(
  currentSearch: string,
  pageParamName = dataTablePageParamName,
) {
  const rawPage = new URLSearchParams(currentSearch).get(pageParamName);
  const page = Number(rawPage);

  return Number.isInteger(page) && page >= 1 ? page : 1;
}
