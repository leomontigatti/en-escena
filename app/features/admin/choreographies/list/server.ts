import { eq, inArray } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  choreographies,
  choreographyProfessors,
  modalities,
  submodalities,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  deriveChoreographyOperationalStatus,
  type ChoreographyOperationalStatus,
} from "@/lib/choreographies/operational-status";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { normalizeSearchValue } from "@/components/shared/data-table-helpers";

type AdministrativeChoreographyRow = {
  academyName: string;
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
  id: string;
  modalityId: string;
  modalityName: string;
  musicStorageKey: string | null;
  name: string;
  submodalityName: string | null;
};

type AdministrativeChoreographyListFilters = {
  category: AdministrativeChoreographyCategoryFilter;
  groupType: ChoreographyGroupType | null;
  modalityId: string | null;
  order: AdministrativeChoreographyOrder;
  page: number;
  query: string;
  status: AdministrativeChoreographyStatusFilter;
};

type AdministrativeChoreographyStatusFilter = "completa" | "incompleta" | null;
type AdministrativeChoreographyCategoryFilter = string | "sin-asignar" | null;
type HydratedAdministrativeChoreographyRow =
  AdministrativeChoreographyListItem & {
    categoryId: string | null;
    modalityId: string;
  };

export type AdministrativeChoreographySortColumn = "academia" | "nombre";

export type AdministrativeChoreographyOrder = {
  columnId: AdministrativeChoreographySortColumn;
  direction: "asc" | "desc";
};

export type AdministrativeChoreographyListItem = {
  academyName: string;
  categoryName: string | null;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  name: string;
  operationalStatus: ChoreographyOperationalStatus;
  submodalityName: string | null;
};

export type AdministrativeChoreographyFilterOption = {
  label: string;
  value: string;
};

type AdministrativeChoreographyFacets = {
  categories: AdministrativeChoreographyFilterOption[];
  modalities: AdministrativeChoreographyFilterOption[];
};

export type AdministrativeChoreographyListResult = {
  choreographies: AdministrativeChoreographyListItem[];
  facets: AdministrativeChoreographyFacets;
  filters: AdministrativeChoreographyListFilters;
  hasAnyChoreography: boolean;
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const administrativeChoreographyPageSize = 50;
const defaultAdministrativeChoreographyOrder: AdministrativeChoreographyOrder =
  {
    columnId: "academia",
    direction: "asc",
  };

export function readAdministrativeChoreographyFilters(
  searchParams: URLSearchParams,
): AdministrativeChoreographyListFilters {
  return {
    category: readAdministrativeChoreographyCategoryFilter(
      searchParams.get("categoria"),
    ),
    groupType: readAdministrativeChoreographyGroupTypeFilter(
      searchParams.get("tipo-grupo"),
    ),
    modalityId: readNonEmptySearchParam(searchParams.get("modalidad")),
    order: readAdministrativeChoreographyOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
    status: readAdministrativeChoreographyStatusFilter(
      searchParams.get("estado"),
    ),
  };
}

export async function loadAdministrativeChoreographies(input: {
  filters: AdministrativeChoreographyListFilters;
  selectedEventId: string | null;
}): Promise<AdministrativeChoreographyListResult> {
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
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
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
  const facets = buildAdministrativeChoreographyFacets(rows);
  const filters = normalizeAdministrativeChoreographyFilters(
    input.filters,
    facets,
  );
  const hydratedRows = await hydrateAdministrativeChoreographies(rows);
  const filteredRows = hydratedRows
    .filter((row) => matchesAdministrativeChoreographyFilters(row, filters))
    .sort((firstRow, secondRow) =>
      compareAdministrativeChoreographies(firstRow, secondRow, filters.order),
    );
  const totalCount = filteredRows.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / administrativeChoreographyPageSize),
  );
  const page = Math.min(filters.page, totalPages);
  const paginatedRows = filteredRows
    .slice(
      (page - 1) * administrativeChoreographyPageSize,
      page * administrativeChoreographyPageSize,
    )
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

export async function loadAdministrativeChoreographyListRouteData(
  request: Request,
) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const url = new URL(request.url);
  const filters = readAdministrativeChoreographyFilters(url.searchParams);
  const listResult = await loadAdministrativeChoreographies({
    filters,
    selectedEventId: eventContext.selectedEventId,
  });
  const canonicalSearch = buildCanonicalAdministrativeChoreographiesSearch({
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

export function isDefaultAdministrativeChoreographyOrder(
  order: AdministrativeChoreographyOrder,
) {
  return (
    order.columnId === defaultAdministrativeChoreographyOrder.columnId &&
    order.direction === defaultAdministrativeChoreographyOrder.direction
  );
}

function buildCanonicalAdministrativeChoreographiesSearch(input: {
  currentSearch: string;
  filters: AdministrativeChoreographyListResult["filters"];
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

  if (!isDefaultAdministrativeChoreographyOrder(input.filters.order)) {
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

function readAdministrativeChoreographyOrder(
  value: string | null,
): AdministrativeChoreographyOrder {
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
      return defaultAdministrativeChoreographyOrder;
  }
}

async function hydrateAdministrativeChoreographies(
  rows: AdministrativeChoreographyRow[],
): Promise<HydratedAdministrativeChoreographyRow[]> {
  if (rows.length === 0) {
    return [];
  }

  const choreographyIds = rows.map((row) => row.id);
  const categoryIds = [
    ...new Set(
      rows
        .map((row) => row.categoryId)
        .filter((categoryId): categoryId is string => categoryId !== null),
    ),
  ];
  const [professorRows, categoryLevelRows] = await Promise.all([
    db
      .select({
        choreographyId: choreographyProfessors.choreographyId,
      })
      .from(choreographyProfessors)
      .where(inArray(choreographyProfessors.choreographyId, choreographyIds)),
    categoryIds.length > 0
      ? db
          .select({
            categoryId: categoryExperienceLevels.categoryId,
          })
          .from(categoryExperienceLevels)
          .where(inArray(categoryExperienceLevels.categoryId, categoryIds))
      : Promise.resolve([]),
  ]);

  const choreographyIdsWithProfessors = new Set(
    professorRows.map((row) => row.choreographyId),
  );
  const categoryIdsWithLevels = new Set(
    categoryLevelRows.map((row) => row.categoryId),
  );

  return rows.map((row) => ({
    academyName: row.academyName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
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
        row.categoryId !== null && categoryIdsWithLevels.has(row.categoryId),
    }),
    submodalityName: row.submodalityName,
  }));
}

function readAdministrativeChoreographyStatusFilter(
  value: string | null,
): AdministrativeChoreographyStatusFilter {
  switch (value) {
    case "completa":
    case "incompleta":
      return value;
    default:
      return null;
  }
}

function readAdministrativeChoreographyCategoryFilter(
  value: string | null,
): AdministrativeChoreographyCategoryFilter {
  if (value === "sin-asignar") {
    return value;
  }

  return readNonEmptySearchParam(value);
}

function readAdministrativeChoreographyGroupTypeFilter(
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

function buildAdministrativeChoreographyFacets(
  rows: AdministrativeChoreographyRow[],
) {
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

function normalizeAdministrativeChoreographyFilters(
  filters: AdministrativeChoreographyListFilters,
  facets: AdministrativeChoreographyFacets,
): AdministrativeChoreographyListFilters {
  return {
    ...filters,
    category: keepKnownFacetValue(filters.category, facets.categories),
    modalityId: keepKnownFacetValue(filters.modalityId, facets.modalities),
  };
}

function matchesAdministrativeChoreographyFilters(
  row: HydratedAdministrativeChoreographyRow,
  filters: AdministrativeChoreographyListFilters,
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

  if (
    !matchesAdministrativeChoreographyCategory(row.categoryId, filters.category)
  ) {
    return false;
  }

  if (filters.groupType !== null && row.groupType !== filters.groupType) {
    return false;
  }

  if (filters.query.length === 0) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(filters.query);

  return (
    normalizeSearchValue(row.name).includes(normalizedQuery) ||
    normalizeSearchValue(row.academyName).includes(normalizedQuery)
  );
}

function compareAdministrativeChoreographies(
  firstRow: AdministrativeChoreographyListItem,
  secondRow: AdministrativeChoreographyListItem,
  order: AdministrativeChoreographyOrder,
) {
  if (order.columnId === "nombre") {
    const comparison = compareAdministrativeText(firstRow.name, secondRow.name);

    if (comparison !== 0) {
      return applySortDirection(comparison, order.direction);
    }

    const academyComparison = compareAdministrativeText(
      firstRow.academyName,
      secondRow.academyName,
    );

    if (academyComparison !== 0) {
      return academyComparison;
    }

    return firstRow.id.localeCompare(secondRow.id, "es-AR");
  }

  const academyComparison = compareAdministrativeText(
    firstRow.academyName,
    secondRow.academyName,
  );

  if (academyComparison !== 0) {
    return applySortDirection(academyComparison, order.direction);
  }

  const nameComparison = compareAdministrativeText(
    firstRow.name,
    secondRow.name,
  );

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return firstRow.id.localeCompare(secondRow.id, "es-AR");
}

function compareAdministrativeText(firstValue: string, secondValue: string) {
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
  options: AdministrativeChoreographyFilterOption[],
) {
  if (value === null) {
    return null;
  }

  return options.some((option) => option.value === value) ? value : null;
}

function matchesAdministrativeChoreographyCategory(
  categoryId: string | null,
  categoryFilter: AdministrativeChoreographyCategoryFilter,
) {
  if (categoryFilter === null) {
    return true;
  }

  if (categoryFilter === "sin-asignar") {
    return categoryId === null;
  }

  return categoryId === categoryFilter;
}

function getUniqueSortedFilterOptions(
  options: AdministrativeChoreographyFilterOption[],
) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((firstOption, secondOption) =>
    compareAdministrativeText(firstOption.label, secondOption.label),
  );
}
