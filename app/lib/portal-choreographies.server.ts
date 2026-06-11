import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryExperienceLevels,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  experienceLevels,
  modalities,
  professors,
  scheduleBlocks,
  scheduleEntries,
  submodalities,
} from "@/db/schema";

export type ChoreographyOperationalPendingItem =
  | "music"
  | "category"
  | "experienceLevel"
  | "professors";

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

export type ChoreographyListItem = {
  id: string;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  groupType: "solo" | "duo" | "trio" | "grupal";
  categoryName: string | null;
  experienceLevelName: string | null;
  operationalStatus: ChoreographyOperationalStatus;
};

export type ChoreographyDetail = ChoreographyListItem & {
  scheduleBlockName: string;
  scheduleLabel: string;
  dancers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    active: boolean;
    ageAtEventStart: number;
  }>;
  professors: Array<{
    id: string;
    firstName: string;
    lastName: string;
    active: boolean;
  }>;
};

type ChoreographyRow = {
  id: string;
  name: string;
  groupType: "solo" | "duo" | "trio" | "grupal";
  categoryId: string | null;
  experienceLevelId: string | null;
  musicStorageKey: string | null;
  modalityName: string;
  submodalityName: string | null;
  categoryName: string | null;
  experienceLevelName: string | null;
};

export async function listChoreographiesForAcademyEvent(
  academyId: string,
  eventId: string,
): Promise<ChoreographyListItem[]> {
  const rows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      groupType: choreographies.groupType,
      categoryId: choreographies.categoryId,
      experienceLevelId: choreographies.experienceLevelId,
      musicStorageKey: choreographies.musicStorageKey,
      modalityName: modalities.name,
      submodalityName: submodalities.name,
      categoryName: categories.name,
      experienceLevelName: experienceLevels.name,
    })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
    .leftJoin(
      experienceLevels,
      eq(choreographies.experienceLevelId, experienceLevels.id),
    )
    .where(
      and(
        eq(choreographies.academyId, academyId),
        eq(choreographies.eventId, eventId),
      ),
    )
    .orderBy(desc(choreographies.createdAt), asc(choreographies.name));

  return await hydrateChoreographyRows(rows);
}

export async function findChoreographyForAcademyEvent(
  academyId: string,
  eventId: string,
  choreographyId: string,
): Promise<ChoreographyDetail | null> {
  const [row] = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      groupType: choreographies.groupType,
      categoryId: choreographies.categoryId,
      experienceLevelId: choreographies.experienceLevelId,
      musicStorageKey: choreographies.musicStorageKey,
      modalityName: modalities.name,
      submodalityName: submodalities.name,
      categoryName: categories.name,
      experienceLevelName: experienceLevels.name,
      scheduleBlockName: scheduleBlocks.name,
      scheduleDate: scheduleBlocks.scheduledDate,
      scheduleTime: scheduleBlocks.startTime,
    })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
    .leftJoin(
      experienceLevels,
      eq(choreographies.experienceLevelId, experienceLevels.id),
    )
    .innerJoin(
      scheduleEntries,
      eq(choreographies.scheduleEntryId, scheduleEntries.id),
    )
    .innerJoin(
      scheduleBlocks,
      eq(scheduleEntries.scheduleBlockId, scheduleBlocks.id),
    )
    .where(
      and(
        eq(choreographies.id, choreographyId),
        eq(choreographies.academyId, academyId),
        eq(choreographies.eventId, eventId),
      ),
    );

  if (!row) {
    return null;
  }

  const [base] = await hydrateChoreographyRows([row]);
  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        id: dancers.id,
        firstName: dancers.firstName,
        lastName: dancers.lastName,
        active: dancers.active,
        ageAtEventStart: choreographyDancers.ageAtEventStart,
      })
      .from(choreographyDancers)
      .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
      .where(eq(choreographyDancers.choreographyId, choreographyId))
      .orderBy(asc(dancers.lastName), asc(dancers.firstName)),
    db
      .select({
        id: professors.id,
        firstName: professors.firstName,
        lastName: professors.lastName,
        active: professors.active,
      })
      .from(choreographyProfessors)
      .innerJoin(
        professors,
        eq(choreographyProfessors.professorId, professors.id),
      )
      .where(eq(choreographyProfessors.choreographyId, choreographyId))
      .orderBy(asc(professors.lastName), asc(professors.firstName)),
  ]);

  return {
    ...base,
    scheduleBlockName: row.scheduleBlockName,
    scheduleLabel: `${row.scheduleDate} · ${row.scheduleTime}`,
    dancers: dancerRows,
    professors: professorRows,
  };
}

async function hydrateChoreographyRows(
  rows: ChoreographyRow[],
): Promise<ChoreographyListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const choreographyIds = rows.map((row) => row.id);
  const categoryIds = rows
    .map((row) => row.categoryId)
    .filter((value): value is string => value !== null);
  const [professorCounts, categoryLevelRows] = await Promise.all([
    db
      .select({
        choreographyId: choreographyProfessors.choreographyId,
        professorId: choreographyProfessors.professorId,
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

  const professorCountByChoreographyId = new Map<string, number>();
  for (const row of professorCounts) {
    professorCountByChoreographyId.set(
      row.choreographyId,
      (professorCountByChoreographyId.get(row.choreographyId) ?? 0) + 1,
    );
  }

  const categoryIdsWithLevels = new Set(
    categoryLevelRows.map((row) => row.categoryId),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    modalityName: row.modalityName,
    submodalityName: row.submodalityName,
    groupType: row.groupType,
    categoryName: row.categoryName,
    experienceLevelName: row.experienceLevelName,
    operationalStatus: deriveOperationalStatus({
      categoryId: row.categoryId,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      professorCount: professorCountByChoreographyId.get(row.id) ?? 0,
      requiresExperienceLevel:
        row.categoryId !== null && categoryIdsWithLevels.has(row.categoryId),
    }),
  }));
}

function deriveOperationalStatus(input: {
  categoryId: string | null;
  experienceLevelId: string | null;
  hasMusic: boolean;
  professorCount: number;
  requiresExperienceLevel: boolean;
}): ChoreographyOperationalStatus {
  const pendingItems: ChoreographyOperationalPendingItem[] = [];

  if (!input.hasMusic) {
    pendingItems.push("music");
  }

  if (input.categoryId === null) {
    pendingItems.push("category");
  }

  if (
    input.categoryId !== null &&
    input.requiresExperienceLevel &&
    input.experienceLevelId === null
  ) {
    pendingItems.push("experienceLevel");
  }

  if (input.professorCount === 0) {
    pendingItems.push("professors");
  }

  return {
    code: pendingItems.length === 0 ? "complete" : "incomplete",
    pendingItems,
  };
}

export function formatGroupTypeLabel(
  groupType: ChoreographyListItem["groupType"],
) {
  switch (groupType) {
    case "solo":
      return "Solo";
    case "duo":
      return "Dúo";
    case "trio":
      return "Trío";
    case "grupal":
      return "Grupal";
  }
}

export function formatOperationalPendingItemLabel(
  pendingItem: ChoreographyOperationalPendingItem,
) {
  switch (pendingItem) {
    case "music":
      return "Música";
    case "category":
      return "Categoría";
    case "experienceLevel":
      return "Nivel de experiencia";
    case "professors":
      return "Profesores";
  }
}
