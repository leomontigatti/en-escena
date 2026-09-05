import { useLocation, useNavigate } from "react-router";

import { buildDataTablePageHref } from "@/components/shared/data-table-helpers";
import { dataTablePageParamName } from "@/components/shared/data-table.shared";

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
  pageParamName = dataTablePageParamName,
}: {
  basePath: string;
  pageParamName?: string;
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
  };
}

function readDataTablePage(
  currentSearch: string,
  pageParamName = dataTablePageParamName,
) {
  const rawPage = new URLSearchParams(currentSearch).get(pageParamName);
  const page = Number(rawPage);

  return Number.isInteger(page) && page >= 1 ? page : 1;
}
