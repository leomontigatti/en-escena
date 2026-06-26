import { asc, eq, inArray } from "drizzle-orm";

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

export async function loadAdministrativeChoreographies(input: {
  selectedEventId: string | null;
}) {
  if (input.selectedEventId === null) {
    return {
      choreographies: [],
      selectedEventId: null,
    };
  }

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
    .where(eq(choreographies.eventId, input.selectedEventId))
    .orderBy(asc(academies.name), asc(choreographies.name));

  return {
    choreographies: await hydrateAdministrativeChoreographies(rows),
    selectedEventId: input.selectedEventId,
  };
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
