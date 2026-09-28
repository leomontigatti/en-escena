import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";

import {
  formatListOrder,
  listQueryParamNames,
} from "@/lib/list-query/list-query";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableSortDirection,
  DataTableSortValue,
} from "@/components/shared/data-table.shared";

export function getPaginationPages(pageCount: number, currentPage: number) {
  if (pageCount <= 1) {
    return [1];
  }

  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount,
  ]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((firstPage, secondPage) => firstPage - secondPage);

  return sortedPages.flatMap((page, index) => {
    if (index === 0) {
      return [page];
    }

    const previousPage = sortedPages[index - 1];

    if (page - previousPage === 1) {
      return [page];
    }

    if (page - previousPage === 2) {
      return [previousPage + 1, page];
    }

    return ["ellipsis", page] as const;
  });
}

export function toSortDirection(sortValue: false | DataTableSortDirection) {
  return sortValue === "asc" || sortValue === "desc" ? sortValue : false;
}

export function getServerSortDirection(
  serverSort: SortingState[number] | undefined,
  columnId: string,
) {
  if (serverSort?.id !== columnId) {
    return false;
  }

  return serverSort.desc ? "desc" : "asc";
}

export function getNextServerSortDirection(
  currentDirection: DataTableSortDirection | false,
): DataTableSortDirection {
  return currentDirection === "asc" ? "desc" : "asc";
}

export function isFacetedFilterValue(
  value: unknown,
): value is DataTableFacetedFilterValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getActiveFacetedFilterValues(
  filterValue: DataTableFacetedFilterValue,
) {
  return Object.values(filterValue).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

export function getFacetedFilterSummary(
  groups: DataTableFacetedFilter[],
  selectedValues: DataTableFacetedFilterValue,
) {
  const parts = groups.flatMap((group) => {
    const selectedValue = selectedValues[group.id];

    if (!selectedValue) {
      return [];
    }

    const selectedOption = group.options.find(
      (option) => option.value === selectedValue,
    );

    return selectedOption ? [`${group.label}: ${selectedOption.label}`] : [];
  });

  return parts.join(", ");
}

export function createColumnFilters(
  facetedFilterValues: Record<string, DataTableFacetedFilterValue>,
): ColumnFiltersState {
  return Object.entries(facetedFilterValues).map(([columnId, value]) => ({
    id: columnId,
    value,
  }));
}

export function mergeBaseFacetedFilterValues(
  baseValues: Record<string, DataTableFacetedFilterValue>,
  selectedValues: Record<string, DataTableFacetedFilterValue>,
) {
  const mergedValues: Record<string, DataTableFacetedFilterValue> = {
    ...baseValues,
  };

  for (const [columnId, values] of Object.entries(selectedValues)) {
    mergedValues[columnId] = mergeBaseFacetedFilterValue(
      baseValues[columnId],
      values,
    );
  }

  return mergedValues;
}

function mergeBaseFacetedFilterValue(
  baseValue: DataTableFacetedFilterValue | undefined,
  selectedValue: DataTableFacetedFilterValue,
) {
  return {
    ...(baseValue ?? {}),
    ...selectedValue,
  };
}

export function getVisibleFacetedFilterValue(
  baseValue: DataTableFacetedFilterValue | undefined,
  selectedValue: DataTableFacetedFilterValue,
) {
  if (!baseValue) {
    return selectedValue;
  }

  const visibleValue = { ...selectedValue };

  for (const [groupId, value] of Object.entries(baseValue)) {
    if (visibleValue[groupId] === value) {
      delete visibleValue[groupId];
    }
  }

  return visibleValue;
}

/**
 * Writes one group's selection, leaving the other groups alone. Clearing a
 * group —the panel's `Limpiar`, or re-picking what is already picked, which
 * says the same thing— removes it rather than storing an empty value, so a
 * cleared group never reaches the URL.
 */
export function setFacetedFilterValue(
  selectedValues: DataTableFacetedFilterValue,
  groupId: string,
  nextValue: string,
) {
  const updatedValues = { ...selectedValues };

  if (nextValue === "" || nextValue === selectedValues[groupId]) {
    delete updatedValues[groupId];
  } else {
    updatedValues[groupId] = nextValue;
  }

  return updatedValues;
}

export function mergeServerFilterValues(
  columnFilters: ColumnFiltersState,
  columnId: string,
  values: DataTableFacetedFilterValue,
) {
  const nextFilters = columnFilters.filter((entry) => entry.id !== columnId);

  nextFilters.push({
    id: columnId,
    value: values,
  });

  return nextFilters;
}

function removePageSearchParam(searchParams: URLSearchParams) {
  searchParams.delete(listQueryParamNames.page);
}

export function buildDataTablePageHref({
  basePath,
  currentSearch,
  page,
}: {
  basePath: string;
  currentSearch: string;
  page: number;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  if (page <= 1) {
    searchParams.delete(listQueryParamNames.page);
  } else {
    searchParams.set(listQueryParamNames.page, String(page));
  }

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableSearchHref({
  basePath,
  currentSearch,
  searchValue,
}: {
  basePath: string;
  currentSearch: string;
  searchValue: string;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  if (searchValue.trim().length > 0) {
    searchParams.set(listQueryParamNames.search, searchValue.trim());
  } else {
    searchParams.delete(listQueryParamNames.search);
  }

  removePageSearchParam(searchParams);

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableFilterHref({
  basePath,
  currentSearch,
  groups,
  values,
}: {
  basePath: string;
  currentSearch: string;
  groups: DataTableFacetedFilter[];
  values: DataTableFacetedFilterValue;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  for (const group of groups) {
    const queryParamKey = group.id;
    const nextValue = values[queryParamKey];

    if (nextValue) {
      searchParams.set(queryParamKey, nextValue);
    } else {
      searchParams.delete(queryParamKey);
    }
  }

  removePageSearchParam(searchParams);

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableSortHref({
  basePath,
  columnId,
  currentSearch,
  direction,
}: {
  basePath: string;
  columnId: string;
  currentSearch: string;
  direction: DataTableSortDirection;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  searchParams.set(
    listQueryParamNames.order,
    formatListOrder({ columnId, direction }),
  );
  removePageSearchParam(searchParams);

  return buildTableHref(basePath, searchParams);
}

function buildTableHref(basePath: string, searchParams?: URLSearchParams) {
  const search = searchParams?.toString() ?? "";

  return search.length > 0 ? `${basePath}?${search}` : basePath;
}

export function compareSortValues(
  firstValue: DataTableSortValue,
  secondValue: DataTableSortValue,
) {
  if (firstValue === secondValue) {
    return 0;
  }

  if (firstValue === null || firstValue === undefined) {
    return 1;
  }

  if (secondValue === null || secondValue === undefined) {
    return -1;
  }

  if (firstValue instanceof Date && secondValue instanceof Date) {
    return firstValue.getTime() - secondValue.getTime();
  }

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return firstValue - secondValue;
  }

  if (typeof firstValue === "boolean" && typeof secondValue === "boolean") {
    return Number(firstValue) - Number(secondValue);
  }

  return String(firstValue).localeCompare(String(secondValue), "es-AR", {
    sensitivity: "base",
    numeric: true,
  });
}
