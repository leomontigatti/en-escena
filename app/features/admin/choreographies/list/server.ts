import { eq, inArray } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  choreographyProfessors,
  modalities,
  submodalities,
} from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { formatChoreographyNumber } from "@/lib/choreographies/choreography-number";
import {
  deriveChoreographyOperationalStatus,
  type ChoreographyOperationalStatus,
} from "@/lib/choreographies/operational-status";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { normalizeSearchValue } from "@/components/shared/data-table-helpers";

type ChoreographyRow = {
  academyName: string;
  categoryId: string | null;
  choreographyNumber: number;
  categoryName: string | null;
  experienceLevelId: string | null;
  categoryExperienceLevels: string[] | null;
  groupType: ChoreographyGroupType;
  id: string;
  modalityId: string;
  modalityName: string;
  musicStorageKey: string | null;
  name: string;
  submodalityName: string | null;
};

type ChoreographyListFilters = {
  category: ChoreographyCategoryFilter;
  groupType: ChoreographyGroupType | null;
  modalityId: string | null;
  order: ChoreographyOrder;
  page: number;
  query: string;
  status: ChoreographyStatusFilter;
};

type ChoreographyStatusFilter = "completa" | "incompleta" | null;
type ChoreographyCategoryFilter = string | "sin-asignar" | null;
type HydratedChoreographyRow = ChoreographyListItem & {
  categoryId: string | null;
  modalityId: string;
};

type ChoreographySortColumn = "academia" | "nombre";

type ChoreographyOrder = {
  columnId: ChoreographySortColumn;
  direction: "asc" | "desc";
};

export type ChoreographyListItem = {
  academyName: string;
  categoryName: string | null;
  choreographyNumber: number;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  name: string;
  operationalStatus: ChoreographyOperationalStatus;
  submodalityName: string | null;
};

type ChoreographyFilterOption = {
  label: string;
  value: string;
};

type ChoreographyFacets = {
  categories: ChoreographyFilterOption[];
  modalities: ChoreographyFilterOption[];
};

export type ChoreographyListResult = {
  choreographies: ChoreographyListItem[];
  facets: ChoreographyFacets;
  filters: ChoreographyListFilters;
  hasAnyChoreography: boolean;
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const choreographyPageSize = 50;
const defaultChoreographyOrder: ChoreographyOrder = {
  columnId: "academia",
  direction: "asc",
};

function readChoreographyFilters(
  searchParams: URLSearchParams,
): ChoreographyListFilters {
  return {
    category: readChoreographyCategoryFilter(searchParams.get("categoria")),
    groupType: readChoreographyGroupTypeFilter(searchParams.get("tipo-grupo")),
    modalityId: readNonEmptySearchParam(searchParams.get("modalidad")),
    order: readChoreographyOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
    status: readChoreographyStatusFilter(searchParams.get("estado")),
  };
}

export async function loadChoreographies(input: {
  filters: ChoreographyListFilters;
  selectedEventId: string | null;
}): Promise<ChoreographyListResult> {
  if (input.selectedEventId === null) {
    return {
      choreographies: [],
      facets: {
        categories: [],
        modalities: [],
      },
      filters: input.filters,
      hasAnyChoreography: false,
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const selectedEventId = input.selectedEventId;
  const rows = await db
    .select({
      academyName: academies.name,
      categoryId: choreographies.categoryId,
      choreographyNumber: choreographies.choreographyNumber,
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
      categoryExperienceLevels: categories.experienceLevels,
      groupType: choreographies.groupType,
      id: choreographies.id,
      modalityId: choreographies.modalityId,
      modalityName: modalities.name,
      musicStorageKey: choreographies.musicStorageKey,
      name: choreographies.name,
      submodalityName: submodalities.name,
    })
    .from(choreographies)
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
    .where(eq(choreographies.eventId, selectedEventId));
  const hasAnyChoreography = rows.length > 0;
  const facets = buildChoreographyFacets(rows);
  const filters = normalizeChoreographyFilters(input.filters, facets);
  const hydratedRows = await hydrateChoreographies(rows);
  const filteredRows = hydratedRows
    .filter((row) => matchesChoreographyFilters(row, filters))
    .sort((firstRow, secondRow) =>
      compareChoreographies(firstRow, secondRow, filters.order),
    );
  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / choreographyPageSize));
  const page = Math.min(filters.page, totalPages);
  const paginatedRows = filteredRows
    .slice((page - 1) * choreographyPageSize, page * choreographyPageSize)
    .map(({ categoryId: _categoryId, modalityId: _modalityId, ...row }) => row);

  return {
    choreographies: paginatedRows,
    facets,
    filters: {
      ...filters,
      page,
    },
    hasAnyChoreography,
    selectedEventId,
    totalCount,
    totalPages,
  };
}

export async function loadChoreographyListRouteData(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const url = new URL(request.url);
  const filters = readChoreographyFilters(url.searchParams);
  const listResult = await loadChoreographies({
    filters,
    selectedEventId: eventContext.selectedEventId,
  });
  const canonicalSearch = buildCanonicalChoreographiesSearch({
    currentSearch: url.search,
    filters: listResult.filters,
  });
  const currentSearch = new URLSearchParams(url.search).toString();

  if (canonicalSearch !== currentSearch) {
    throw redirect(
      canonicalSearch.length > 0
        ? `${url.pathname}?${canonicalSearch}`
        : url.pathname,
    );
  }

  return listResult;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function isDefaultChoreographyOrder(order: ChoreographyOrder) {
  return (
    order.columnId === defaultChoreographyOrder.columnId &&
    order.direction === defaultChoreographyOrder.direction
  );
}

function buildCanonicalChoreographiesSearch(input: {
  currentSearch: string;
  filters: ChoreographyListResult["filters"];
}) {
  const searchParams = new URLSearchParams(input.currentSearch);

  if (input.filters.query.length > 0) {
    searchParams.set("busqueda", input.filters.query);
  } else {
    searchParams.delete("busqueda");
  }

  if (input.filters.status) {
    searchParams.set("estado", input.filters.status);
  } else {
    searchParams.delete("estado");
  }

  if (input.filters.modalityId) {
    searchParams.set("modalidad", input.filters.modalityId);
  } else {
    searchParams.delete("modalidad");
  }

  if (input.filters.category) {
    searchParams.set("categoria", input.filters.category);
  } else {
    searchParams.delete("categoria");
  }

  if (input.filters.groupType) {
    searchParams.set("tipo-grupo", input.filters.groupType);
  } else {
    searchParams.delete("tipo-grupo");
  }

  if (!isDefaultChoreographyOrder(input.filters.order)) {
    searchParams.set(
      "orden",
      `${input.filters.order.columnId}:${input.filters.order.direction}`,
    );
  } else {
    searchParams.delete("orden");
  }

  if (input.filters.page > 1) {
    searchParams.set("pagina", String(input.filters.page));
  } else {
    searchParams.delete("pagina");
  }

  return searchParams.toString();
}

function readChoreographyOrder(value: string | null): ChoreographyOrder {
  switch (value) {
    case "academia:asc":
      return { columnId: "academia", direction: "asc" };
    case "academia:desc":
      return { columnId: "academia", direction: "desc" };
    case "nombre:asc":
      return { columnId: "nombre", direction: "asc" };
    case "nombre:desc":
      return { columnId: "nombre", direction: "desc" };
    default:
      return defaultChoreographyOrder;
  }
}

async function hydrateChoreographies(
  rows: ChoreographyRow[],
): Promise<HydratedChoreographyRow[]> {
  if (rows.length === 0) {
    return [];
  }

  const choreographyIds = rows.map((row) => row.id);
  const [professorRows] = await Promise.all([
    db
      .select({
        choreographyId: choreographyProfessors.choreographyId,
      })
      .from(choreographyProfessors)
      .where(inArray(choreographyProfessors.choreographyId, choreographyIds)),
  ]);

  const choreographyIdsWithProfessors = new Set(
    professorRows.map((row) => row.choreographyId),
  );

  return rows.map((row) => ({
    academyName: row.academyName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    choreographyNumber: row.choreographyNumber,
    groupType: row.groupType,
    id: row.id,
    modalityId: row.modalityId,
    modalityName: row.modalityName,
    name: row.name,
    operationalStatus: deriveChoreographyOperationalStatus({
      categoryId: row.categoryId,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      hasProfessors: choreographyIdsWithProfessors.has(row.id),
      requiresExperienceLevel:
        row.categoryExperienceLevels !== null &&
        row.categoryExperienceLevels.length > 0,
    }),
    submodalityName: row.submodalityName,
  }));
}

function readChoreographyStatusFilter(
  value: string | null,
): ChoreographyStatusFilter {
  switch (value) {
    case "completa":
    case "incompleta":
      return value;
    default:
      return null;
  }
}

function readChoreographyCategoryFilter(
  value: string | null,
): ChoreographyCategoryFilter {
  if (value === "sin-asignar") {
    return value;
  }

  return readNonEmptySearchParam(value);
}

function readChoreographyGroupTypeFilter(
  value: string | null,
): ChoreographyGroupType | null {
  switch (value) {
    case "solo":
    case "duo":
    case "trio":
    case "grupal":
      return value;
    default:
      return null;
  }
}

function readNonEmptySearchParam(value: string | null) {
  return value?.trim().length ? value.trim() : null;
}

function buildChoreographyFacets(rows: ChoreographyRow[]) {
  return {
    categories: getUniqueSortedFilterOptions(
      rows.map((row) => ({
        label: row.categoryName ?? "Sin asignar",
        value: row.categoryId ?? "sin-asignar",
      })),
    ),
    modalities: getUniqueSortedFilterOptions(
      rows.map((row) => ({
        label: row.modalityName,
        value: row.modalityId,
      })),
    ),
  };
}

function normalizeChoreographyFilters(
  filters: ChoreographyListFilters,
  facets: ChoreographyFacets,
): ChoreographyListFilters {
  return {
    ...filters,
    category: keepKnownFacetValue(filters.category, facets.categories),
    modalityId: keepKnownFacetValue(filters.modalityId, facets.modalities),
  };
}

function matchesChoreographyFilters(
  row: HydratedChoreographyRow,
  filters: ChoreographyListFilters,
) {
  if (
    filters.status === "completa" &&
    row.operationalStatus.code !== "complete"
  ) {
    return false;
  }

  if (
    filters.status === "incompleta" &&
    row.operationalStatus.code !== "incomplete"
  ) {
    return false;
  }

  if (filters.modalityId !== null && row.modalityId !== filters.modalityId) {
    return false;
  }

  if (!matchesChoreographyCategory(row.categoryId, filters.category)) {
    return false;
  }

  if (filters.groupType !== null && row.groupType !== filters.groupType) {
    return false;
  }

  if (filters.query.length === 0) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(filters.query);

  // The number is compared already zero-padded, so `42`, `042` and `00042` all
  // find the same choreography. It stays an `includes` like the rest of the
  // search: an admin who only remembers the tail of the number types that and
  // still gets there.
  return (
    normalizeSearchValue(row.name).includes(normalizedQuery) ||
    normalizeSearchValue(row.academyName).includes(normalizedQuery) ||
    formatChoreographyNumber(row.choreographyNumber).includes(normalizedQuery)
  );
}

function compareChoreographies(
  firstRow: ChoreographyListItem,
  secondRow: ChoreographyListItem,
  order: ChoreographyOrder,
) {
  if (order.columnId === "nombre") {
    const comparison = compareText(firstRow.name, secondRow.name);

    if (comparison !== 0) {
      return applySortDirection(comparison, order.direction);
    }

    const academyComparison = compareText(
      firstRow.academyName,
      secondRow.academyName,
    );

    if (academyComparison !== 0) {
      return academyComparison;
    }

    return firstRow.id.localeCompare(secondRow.id, "es-AR");
  }

  const academyComparison = compareText(
    firstRow.academyName,
    secondRow.academyName,
  );

  if (academyComparison !== 0) {
    return applySortDirection(academyComparison, order.direction);
  }

  const nameComparison = compareText(firstRow.name, secondRow.name);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return firstRow.id.localeCompare(secondRow.id, "es-AR");
}

function compareText(firstValue: string, secondValue: string) {
  return firstValue.localeCompare(secondValue, "es-AR", {
    sensitivity: "base",
    numeric: true,
  });
}

function applySortDirection(comparison: number, direction: "asc" | "desc") {
  return direction === "desc" ? comparison * -1 : comparison;
}

function keepKnownFacetValue(
  value: string | null,
  options: ChoreographyFilterOption[],
) {
  if (value === null) {
    return null;
  }

  return options.some((option) => option.value === value) ? value : null;
}

function matchesChoreographyCategory(
  categoryId: string | null,
  categoryFilter: ChoreographyCategoryFilter,
) {
  if (categoryFilter === null) {
    return true;
  }

  if (categoryFilter === "sin-asignar") {
    return categoryId === null;
  }

  return categoryId === categoryFilter;
}

function getUniqueSortedFilterOptions(options: ChoreographyFilterOption[]) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((firstOption, secondOption) =>
    compareText(firstOption.label, secondOption.label),
  );
}
