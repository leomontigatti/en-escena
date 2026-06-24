import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";

import type { DataTableFacetedFilter } from "@/components/shared/data-table";

type SortDirection = "asc" | "desc";

type DataTableFacetedFilterValue = Record<string, string>;

type DataTableFacetedFilterGroup = DataTableFacetedFilter["groups"][number];

type SortValue = string | number | Date | boolean | null | undefined;

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

export function toSortDirection(sortValue: false | SortDirection) {
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
  currentDirection: SortDirection | false,
): SortDirection {
  return currentDirection === "asc" ? "desc" : "asc";
}

export function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR")
    .trim();
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

export function getFilterGroupQueryParamKey(
  group: DataTableFacetedFilterGroup,
) {
  return group.id ?? group.label;
}

export function getFacetedFilterSummary(
  filter: DataTableFacetedFilter,
  selectedValues: DataTableFacetedFilterValue,
) {
  const parts = filter.groups.flatMap((group) => {
    const selectedValue = selectedValues[getFilterGroupQueryParamKey(group)];

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

export function mergeBaseFacetedFilterValue(
  baseValue: DataTableFacetedFilterValue | undefined,
  selectedValue: DataTableFacetedFilterValue,
) {
  return {
    ...(baseValue ?? {}),
    ...selectedValue,
  };
}

export function getSelectedFacetedFilterValue(
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

function removePageSearchParam(
  searchParams: URLSearchParams,
  pageParamName = "page",
) {
  searchParams.delete(pageParamName);
}

export function buildDataTablePageHref({
  basePath,
  currentSearch,
  page,
  pageParamName = "page",
}: {
  basePath: string;
  currentSearch: string;
  page: number;
  pageParamName?: string;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  if (page <= 1) {
    searchParams.delete(pageParamName);
  } else {
    searchParams.set(pageParamName, String(page));
  }

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableSearchHref({
  basePath,
  currentSearch,
  pageParamName = "page",
  searchParamName = "q",
  searchValue,
}: {
  basePath: string;
  currentSearch: string;
  pageParamName?: string;
  searchParamName?: string;
  searchValue: string;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  if (searchValue.trim().length > 0) {
    searchParams.set(searchParamName, searchValue.trim());
  } else {
    searchParams.delete(searchParamName);
  }

  removePageSearchParam(searchParams, pageParamName);

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableFilterHref({
  basePath,
  currentSearch,
  filter,
  pageParamName = "page",
  values,
}: {
  basePath: string;
  currentSearch: string;
  filter: DataTableFacetedFilter;
  pageParamName?: string;
  values: DataTableFacetedFilterValue;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  for (const group of filter.groups) {
    const queryParamKey = getFilterGroupQueryParamKey(group);
    const nextValue = values[queryParamKey];

    if (nextValue) {
      searchParams.set(queryParamKey, nextValue);
    } else {
      searchParams.delete(queryParamKey);
    }
  }

  removePageSearchParam(searchParams, pageParamName);

  return buildTableHref(basePath, searchParams);
}

export function buildDataTableSortHref({
  basePath,
  columnId,
  currentSearch,
  direction,
  pageParamName = "page",
  sortParamName = "orden",
}: {
  basePath: string;
  columnId: string;
  currentSearch: string;
  direction: SortDirection;
  pageParamName?: string;
  sortParamName?: string;
}) {
  const searchParams = new URLSearchParams(currentSearch);

  searchParams.set(sortParamName, `${columnId}:${direction}`);
  removePageSearchParam(searchParams, pageParamName);

  return buildTableHref(basePath, searchParams);
}

export function buildTableHref(
  basePath: string,
  searchParams?: URLSearchParams,
) {
  const search = searchParams?.toString() ?? "";

  return search.length > 0 ? `${basePath}?${search}` : basePath;
}

export function compareSortValues(
  firstValue: SortValue,
  secondValue: SortValue,
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
