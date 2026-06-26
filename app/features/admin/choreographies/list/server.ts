import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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
import {
  deriveChoreographyOperationalStatus,
  type ChoreographyOperationalStatus,
} from "@/lib/choreographies/operational-status";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

type AdministrativeChoreographyRow = {
  academyName: string;
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  musicStorageKey: string | null;
  name: string;
  submodalityName: string | null;
};

type AdministrativeChoreographyListFilters = {
  order: AdministrativeChoreographyOrder;
  page: number;
  query: string;
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

export type AdministrativeChoreographyListResult = {
  choreographies: AdministrativeChoreographyListItem[];
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
    order: readAdministrativeChoreographyOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
  };
}

export async function loadAdministrativeChoreographies(input: {
  filters: AdministrativeChoreographyListFilters;
  selectedEventId: string | null;
}): Promise<AdministrativeChoreographyListResult> {
  if (input.selectedEventId === null) {
    return {
      choreographies: [],
      filters: input.filters,
      hasAnyChoreography: false,
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const selectedEventId = input.selectedEventId;
  const eventWhere = eq(choreographies.eventId, selectedEventId);
  const where = buildAdministrativeChoreographyWhere({
    filters: input.filters,
    selectedEventId,
  });
  const [anyChoreographyRows, [{ count }]] = await Promise.all([
    db
      .select({ id: choreographies.id })
      .from(choreographies)
      .where(eventWhere)
      .limit(1),
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(choreographies)
      .innerJoin(academies, eq(choreographies.academyId, academies.id))
      .where(where),
  ]);
  const totalCount = Number(count);
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / administrativeChoreographyPageSize),
  );
  const page = Math.min(input.filters.page, totalPages);
  const rows = await db
    .select({
      academyName: academies.name,
      categoryId: choreographies.categoryId,
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
      groupType: choreographies.groupType,
      id: choreographies.id,
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
    .where(where)
    .orderBy(...buildAdministrativeChoreographyOrderBy(input.filters.order))
    .limit(administrativeChoreographyPageSize)
    .offset((page - 1) * administrativeChoreographyPageSize);

  return {
    choreographies: await hydrateAdministrativeChoreographies(rows),
    filters: {
      ...input.filters,
      page,
    },
    hasAnyChoreography: anyChoreographyRows.length > 0,
    selectedEventId,
    totalCount,
    totalPages,
  };
}

function buildAdministrativeChoreographyWhere(input: {
  filters: AdministrativeChoreographyListFilters;
  selectedEventId: string;
}): SQL {
  const eventCondition = eq(choreographies.eventId, input.selectedEventId);

  if (input.filters.query.length === 0) {
    return eventCondition;
  }

  const search = `%${input.filters.query}%`;
  const searchCondition = or(
    ilike(choreographies.name, search),
    ilike(academies.name, search),
  );

  if (!searchCondition) {
    return eventCondition;
  }

  return and(eventCondition, searchCondition) ?? eventCondition;
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

function buildAdministrativeChoreographyOrderBy(
  order: AdministrativeChoreographyOrder,
) {
  const academyOrder =
    order.columnId === "academia" && order.direction === "desc"
      ? desc(sql`lower(${academies.name})`)
      : asc(sql`lower(${academies.name})`);
  const choreographyOrder =
    order.columnId === "nombre" && order.direction === "desc"
      ? desc(sql`lower(${choreographies.name})`)
      : asc(sql`lower(${choreographies.name})`);

  if (order.columnId === "nombre") {
    return [
      choreographyOrder,
      asc(sql`lower(${academies.name})`),
      asc(choreographies.id),
    ] as const;
  }

  return [
    academyOrder,
    asc(sql`lower(${choreographies.name})`),
    asc(choreographies.id),
  ] as const;
}

async function hydrateAdministrativeChoreographies(
  rows: AdministrativeChoreographyRow[],
): Promise<AdministrativeChoreographyListItem[]> {
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
    categoryName: row.categoryName,
    groupType: row.groupType,
    id: row.id,
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
