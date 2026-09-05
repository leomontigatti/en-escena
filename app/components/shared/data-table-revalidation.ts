import type { ShouldRevalidateFunction } from "react-router";

import {
  dataTablePageParamName,
  dataTableSearchParamName,
  dataTableSortParamName,
} from "@/components/shared/data-table.shared";

type DataTableRevalidationParamNames = {
  /**
   * The faceted filter groups the route's table renders, by their query
   * parameter name. A group left out of the list costs an unnecessary reload
   * and never a wrong result, which is why the rule asks the route to name
   * them rather than guessing.
   */
  filterParamNames?: string[];
  pageParamName?: string;
  searchParamName?: string;
  sortParamName?: string;
};

/**
 * Whether a route rendering a browser-paginated table still has something to
 * reload. Recording the list state is a query-string write, and a write is a
 * navigation, so without this rule the router would re-run the loader on every
 * page click and every pause in typing — refetching rows the browser already
 * holds.
 *
 * Only a change confined to the table's own parameters is skipped. Anything
 * else — a different path, an action submission, a parameter the route did not
 * name — falls through to the router's default, so figures still refresh after
 * a preset.
 *
 * Routes rendering a server-paginated table must not adopt this: there the
 * query string *is* the query, and skipping the reload would leave the reader
 * on the rows of the page they left.
 */
export function shouldRevalidateDataTableRoute({
  currentUrl,
  defaultShouldRevalidate,
  filterParamNames = [],
  formMethod,
  nextUrl,
  pageParamName = dataTablePageParamName,
  searchParamName = dataTableSearchParamName,
  sortParamName = dataTableSortParamName,
}: DataTableRevalidationParamNames & {
  currentUrl: URL;
  defaultShouldRevalidate: boolean;
  formMethod?: string;
  nextUrl: URL;
}) {
  if (currentUrl.pathname !== nextUrl.pathname) {
    return defaultShouldRevalidate;
  }

  if (formMethod !== undefined && formMethod.toUpperCase() !== "GET") {
    return defaultShouldRevalidate;
  }

  const changedParamNames = getChangedSearchParamNames(
    currentUrl.searchParams,
    nextUrl.searchParams,
  );

  if (changedParamNames.length === 0) {
    return defaultShouldRevalidate;
  }

  const tableParamNames = new Set([
    pageParamName,
    searchParamName,
    sortParamName,
    ...filterParamNames,
  ]);

  const changedOnlyTableParams = changedParamNames.every((paramName) =>
    tableParamNames.has(paramName),
  );

  return changedOnlyTableParams ? false : defaultShouldRevalidate;
}

/**
 * The rule as a route declares it: one line naming the route's own faceted
 * filter parameters.
 */
export function createDataTableShouldRevalidate(
  paramNames: DataTableRevalidationParamNames = {},
): ShouldRevalidateFunction {
  return ({ currentUrl, defaultShouldRevalidate, formMethod, nextUrl }) =>
    shouldRevalidateDataTableRoute({
      ...paramNames,
      currentUrl,
      defaultShouldRevalidate,
      formMethod,
      nextUrl,
    });
}

function getChangedSearchParamNames(
  currentParams: URLSearchParams,
  nextParams: URLSearchParams,
) {
  const paramNames = new Set([...currentParams.keys(), ...nextParams.keys()]);

  return Array.from(paramNames).filter(
    (paramName) =>
      currentParams.getAll(paramName).join(",") !==
      nextParams.getAll(paramName).join(","),
  );
}
