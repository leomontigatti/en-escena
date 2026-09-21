import { and, eq } from "drizzle-orm";

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
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";
import { findPresentationOrderNumber } from "@/lib/presentations/presentation-queries.server";

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
 * The options the view offers are exactly the ones the intent accepts: the levels
 * the resolved category admits today, and nothing else. A level the category
 * stopped admitting is therefore not offered and cannot be re-saved; what makes
 * the stored value legible is the mismatch alert on the detail, which names it.
 *
 * There is no levels table: they are a global enum and the category declares
 * which ones it admits, so the list is built here and not queried.
 */
function resolveChoreographyExperienceLevelOptions(input: {
  categoryExperienceLevels: string[];
}): ChoreographyExperienceLevelOption[] {
  return input.categoryExperienceLevels.map((level) => ({
    id: level,
    name: experienceLevelLabels[level] ?? level,
  }));
}

type ChoreographyDetailRow = {
  academyId: string;
  academyName: string;
  categoryAgeBasis: number | null;
  categoryExperienceLevels: string[];
  choreographyNumber: number;
  categoryId: string;
  categoryMaxAge: number;
  categoryMinAge: number;
  categoryName: string;
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
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
  categoryId: string;
  choreographyNumber: number;
  categoryName: string;
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
   * The levels the resolved category admits today. It is the list the select
   * offers and the one the intent accepts.
   */
  experienceLevelOptions: ChoreographyExperienceLevelOption[];
  groupType: ChoreographyGroupType;
  /**
   * Whether the choreography is closed for correction. The number it presents
   * with is not what closes it — see evaluation-lock.server.ts.
   */
  isEvaluated: boolean;
  id: string;
  modalityId: string;
  modalityName: string;
  musicDownloadUrl: string | null;
  musicStorageKey: string | null;
  name: string;
  operationalStatus: ReturnType<typeof deriveChoreographyOperationalStatus>;
  /**
   * The number the choreography presents with, or `null` while it has none. It
   * closes nothing: it only tells the administrator that a correction here may
   * need attention on the participation list.
   */
  presentationOrderNumber: number | null;
  professors: Array<{
    active: boolean;
    firstName: string;
    id: string;
    lastName: string;
  }>;
  /**
   * Whether the resolved category declares levels. A category that stopped
   * declaring them keeps whatever is stored on the choreography, but no longer
   * requires it and offers no option for it.
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
      categoryAgeBasis: choreographies.categoryAgeBasis,
      categoryExperienceLevels: categories.experienceLevels,
      categoryId: choreographies.categoryId,
      categoryMaxAge: categories.maxAge,
      categoryMinAge: categories.minAge,
      choreographyNumber: choreographies.choreographyNumber,
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
      groupType: choreographies.groupType,
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
    .innerJoin(categories, eq(choreographies.categoryId, categories.id))
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
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

  const [
    dancerRows,
    professorRows,
    musicDownloadUrl,
    isEvaluated,
    presentationOrderNumber,
  ] = await Promise.all([
    listChoreographyDancers(input.choreographyId),
    listChoreographyProfessors(input.choreographyId),
    loadChoreographyMusicDownloadUrl({
      storage: createDefaultChoreographyMusicStorage(),
      storageKey: row.musicStorageKey,
    }),
    hasEvaluatedPresentation(input.choreographyId),
    findPresentationOrderNumber(input.choreographyId),
  ]);

  const requiresExperienceLevel = row.categoryExperienceLevels.length > 0;

  return {
    academyId: row.academyId,
    academyName: row.academyName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    choreographyNumber: row.choreographyNumber,
    dancers: dancerRows,
    experienceLevelId: row.experienceLevelId,
    experienceLevelName: formatExperienceLevelName(row.experienceLevelId),
    experienceLevelOptions: resolveChoreographyExperienceLevelOptions({
      categoryExperienceLevels: row.categoryExperienceLevels,
    }),
    groupType: row.groupType,
    isEvaluated,
    id: row.id,
    modalityId: row.modalityId,
    modalityName: row.modalityName,
    musicDownloadUrl,
    musicStorageKey: row.musicStorageKey,
    name: row.name,
    operationalStatus: deriveChoreographyOperationalStatus({
      categoryExperienceLevels: row.categoryExperienceLevels,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      hasProfessors: professorRows.length > 0,
      placementCheck: {
        categoryAgeBasis: row.categoryAgeBasis,
        categoryMaxAge: row.categoryMaxAge,
        categoryMinAge: row.categoryMinAge,
      },
    }),
    presentationOrderNumber,
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
