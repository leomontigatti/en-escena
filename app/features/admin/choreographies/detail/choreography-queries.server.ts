import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  modalities,
  schedules,
  scheduleCapacities,
  submodalities,
} from "@/db/schema";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import { deriveChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

import {
  createDefaultChoreographyMusicStorage,
  loadChoreographyMusicDownloadUrl,
} from "@/lib/storage/choreography-music.server";

import {
  listChoreographyDancers,
  listChoreographyProfessors,
} from "./roster-queries.server";

export type ChoreographyExperienceLevelOption = {
  id: string;
  name: string;
};

/**
 * Las opciones que la vista ofrece son exactamente las que el intent acepta:
 * los niveles que declara la categoría resuelta, más el nivel asignado hoy. Ese
 * agregado es solo de visibilidad —si la categoría dejó de admitir el nivel
 * guardado, tiene que seguir a la vista en lugar de desaparecer del select sin
 * explicación—, y reelegirlo es una escritura idéntica a lo que ya hay.
 *
 * No hay tabla de niveles: son un enum global y la categoría declara cuáles
 * admite, así que la lista se arma acá y no se consulta.
 */
export function resolveChoreographyExperienceLevelOptions(input: {
  categoryExperienceLevels: string[] | null;
  experienceLevelId: string | null;
}): ChoreographyExperienceLevelOption[] {
  const options = (input.categoryExperienceLevels ?? []).map((level) => ({
    id: level,
    name: experienceLevelLabels[level] ?? level,
  }));

  if (
    input.experienceLevelId !== null &&
    !options.some((option) => option.id === input.experienceLevelId)
  ) {
    options.push({
      id: input.experienceLevelId,
      name:
        experienceLevelLabels[input.experienceLevelId] ??
        input.experienceLevelId,
    });
  }

  return options;
}

type ChoreographyDetailRow = {
  academyId: string;
  academyName: string;
  categoryExperienceLevels: string[] | null;
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
  hasPresentation: boolean;
  id: string;
  modalityId: string;
  modalityName: string;
  musicStorageKey: string | null;
  name: string;
  scheduleCapacityId: string | null;
  scheduleDate: string;
  scheduleId: string;
  scheduleName: string;
  scheduleTime: string;
  submodalityId: string | null;
  submodalityName: string | null;
};

export type ChoreographyDetail = {
  academyId: string;
  academyName: string;
  categoryId: string | null;
  categoryName: string | null;
  dancers: Array<{
    active: boolean;
    ageAtEventStart: number;
    firstName: string;
    hasEvidence: boolean;
    id: string;
    lastName: string;
  }>;
  experienceLevelId: string | null;
  experienceLevelName: string | null;
  /**
   * Los niveles que admite la categoría resuelta, más el asignado hoy. Es la
   * lista que el select ofrece y la que el intent acepta.
   */
  experienceLevelOptions: ChoreographyExperienceLevelOption[];
  groupType: ChoreographyGroupType;
  hasPresentation: boolean;
  id: string;
  modalityId: string;
  modalityName: string;
  musicDownloadUrl: string | null;
  musicStorageKey: string | null;
  name: string;
  operationalStatus: ReturnType<typeof deriveChoreographyOperationalStatus>;
  professors: Array<{
    active: boolean;
    firstName: string;
    id: string;
    lastName: string;
  }>;
  /**
   * Que la categoría resuelta declare niveles. Distinto de tener opciones: una
   * categoría que dejó de admitir niveles sigue arrastrando el nivel guardado
   * como opción visible, pero ya no lo requiere.
   */
  requiresExperienceLevel: boolean;
  scheduleCapacityId: string;
  scheduleId: string;
  scheduleLabel: string;
  submodalityId: string | null;
  submodalityName: string | null;
};

export async function findChoreographyDetail(input: {
  choreographyId: string;
  selectedEventId: string;
}): Promise<ChoreographyDetail | null> {
  const rows: ChoreographyDetailRow[] = await db
    .select({
      academyId: choreographies.academyId,
      academyName: academies.name,
      categoryExperienceLevels: categories.experienceLevels,
      categoryId: choreographies.categoryId,
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
      groupType: choreographies.groupType,
      hasPresentation: choreographies.hasPresentation,
      id: choreographies.id,
      modalityId: choreographies.modalityId,
      modalityName: modalities.name,
      musicStorageKey: choreographies.musicStorageKey,
      name: choreographies.name,
      scheduleCapacityId: scheduleCapacities.id,
      scheduleDate: schedules.scheduledDate,
      scheduleId: schedules.id,
      scheduleName: schedules.name,
      scheduleTime: schedules.startTime,
      submodalityId: choreographies.submodalityId,
      submodalityName: submodalities.name,
    })
    .from(choreographies)
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .innerJoin(
      schedules,
      or(
        eq(choreographies.scheduleId, schedules.id),
        eq(scheduleCapacities.scheduleId, schedules.id),
      ),
    )
    .where(
      and(
        eq(choreographies.id, input.choreographyId),
        eq(choreographies.eventId, input.selectedEventId),
      ),
    );
  const [row] = rows;

  if (!row) {
    return null;
  }

  const [dancerRows, professorRows, musicDownloadUrl] = await Promise.all([
    listChoreographyDancers(input.choreographyId),
    listChoreographyProfessors(input.choreographyId),
    loadChoreographyMusicDownloadUrl({
      storage: createDefaultChoreographyMusicStorage(),
      storageKey: row.musicStorageKey,
    }),
  ]);

  const requiresExperienceLevel =
    row.categoryExperienceLevels !== null &&
    row.categoryExperienceLevels.length > 0;

  return {
    academyId: row.academyId,
    academyName: row.academyName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    dancers: dancerRows,
    experienceLevelId: row.experienceLevelId,
    experienceLevelName: formatExperienceLevelName(row.experienceLevelId),
    experienceLevelOptions: resolveChoreographyExperienceLevelOptions({
      categoryExperienceLevels: row.categoryExperienceLevels,
      experienceLevelId: row.experienceLevelId,
    }),
    groupType: row.groupType,
    hasPresentation: row.hasPresentation,
    id: row.id,
    modalityId: row.modalityId,
    modalityName: row.modalityName,
    musicDownloadUrl,
    musicStorageKey: row.musicStorageKey,
    name: row.name,
    operationalStatus: deriveChoreographyOperationalStatus({
      categoryId: row.categoryId,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      hasProfessors: professorRows.length > 0,
      requiresExperienceLevel,
    }),
    professors: professorRows,
    requiresExperienceLevel,
    scheduleCapacityId:
      row.scheduleCapacityId ??
      getGlobalScheduleCapacityOptionId(row.scheduleId),
    scheduleId: row.scheduleId,
    scheduleLabel: formatScheduleDateTime({
      name: row.scheduleName,
      scheduledDate: row.scheduleDate,
      startTime: row.scheduleTime,
    }),
    submodalityId: row.submodalityId,
    submodalityName: row.submodalityName,
  };
}

function formatExperienceLevelName(experienceLevelId: string | null) {
  if (experienceLevelId === null) {
    return null;
  }

  return experienceLevelLabels[experienceLevelId] ?? experienceLevelId;
}
