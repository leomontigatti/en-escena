import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  modalities,
  professors,
  schedules,
  scheduleCapacities,
  submodalities,
} from "@/db/schema";
import { deriveChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { hasActiveInvoiceForChoreography } from "@/lib/finances/choreography-invoices.server";
import type { ChoreographyListItem } from "@/lib/portal/choreographies";
import {
  getDancerEditingEligibility,
  type DancerEditingEligibility,
} from "@/lib/choreographies/choreography-roster.server";
import { experienceLevelLabels } from "@/lib/events/experience-levels";

export type ChoreographyDetail = ChoreographyListItem & {
  categoryId: string | null;
  experienceLevelId: string | null;
  dancerEditingEligibility: DancerEditingEligibility;
  hasPresentation?: boolean;
  musicStorageKey: string | null;
  scheduleCapacityId: string;
  scheduleName: string;
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

export type ChoreographyDeletionAvailability = {
  canDelete: boolean;
  warningMessage: string | null;
};

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
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
  categoryExperienceLevels: string[] | null;
};

type ChoreographyDetailRow = ChoreographyRow & {
  hasPresentation: boolean;
  scheduleId: string;
  scheduleName: string;
  scheduleDate: string;
  scheduleCapacityId: string | null;
  scheduleTime: string;
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
      categoryExperienceLevels: categories.experienceLevels,
    })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(categories, eq(choreographies.categoryId, categories.id))
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
  options: {
    isRegistrationOpen: boolean;
  },
): Promise<ChoreographyDetail | null> {
  const rows: ChoreographyDetailRow[] = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      groupType: choreographies.groupType,
      categoryId: choreographies.categoryId,
      experienceLevelId: choreographies.experienceLevelId,
      hasPresentation: choreographies.hasPresentation,
      musicStorageKey: choreographies.musicStorageKey,
      modalityName: modalities.name,
      submodalityName: submodalities.name,
      categoryName: categories.name,
      categoryExperienceLevels: categories.experienceLevels,
      scheduleId: schedules.id,
      scheduleName: schedules.name,
      scheduleDate: schedules.scheduledDate,
      scheduleCapacityId: scheduleCapacities.id,
      scheduleTime: schedules.startTime,
    })
    .from(choreographies)
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
        eq(choreographies.id, choreographyId),
        eq(choreographies.academyId, academyId),
        eq(choreographies.eventId, eventId),
      ),
    );
  const [row] = rows;

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
      .orderBy(asc(dancers.firstName), asc(dancers.lastName)),
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
      .orderBy(asc(professors.firstName), asc(professors.lastName)),
  ]);

  return {
    ...base,
    categoryId: row.categoryId,
    dancerEditingEligibility: getDancerEditingEligibility({
      hasPresentation: row.hasPresentation,
      isRegistrationOpen: options.isRegistrationOpen,
    }),
    experienceLevelId: row.experienceLevelId,
    hasPresentation: row.hasPresentation,
    musicStorageKey: row.musicStorageKey,
    scheduleCapacityId:
      row.scheduleCapacityId ??
      getGlobalScheduleCapacityOptionId(row.scheduleId),
    scheduleName: row.scheduleName,
    scheduleLabel: formatScheduleDateTime({
      name: row.scheduleName,
      scheduledDate: row.scheduleDate,
      startTime: row.scheduleTime,
    }),
    dancers: dancerRows,
    professors: professorRows,
  };
}

function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}

export {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  updateChoreography,
  updateChoreographyDancers,
  updateChoreographyProfessors,
} from "@/lib/choreographies/choreography-roster.server";
export type {
  ChoreographyCategoryCalculationMode,
  ChoreographyDancerOption,
  ChoreographyDancerScheduleOption,
  ChoreographyDancerScheduleResolution,
  ChoreographyProfessorOption,
  DancerEditingBlockReason,
  ResolveChoreographyDancersResult,
  UpdateChoreographyDancersResult,
  UpdateChoreographyProfessorsResult,
  UpdateChoreographyResult,
} from "@/lib/choreographies/choreography-roster.server";

export async function deleteChoreography(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
}): Promise<void> {
  const choreography = await db.query.choreographies.findFirst({
    columns: {
      id: true,
      academyId: true,
      eventId: true,
    },
    where: eq(choreographies.id, input.choreographyId),
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (
    choreography.academyId !== input.academyId ||
    choreography.eventId !== input.eventId
  ) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (await hasActiveInvoiceForChoreography(input.choreographyId)) {
    throw new Response(
      "No podés eliminar esta Coreografía porque tiene una factura activa.",
      { status: 409 },
    );
  }

  await db
    .delete(choreographies)
    .where(eq(choreographies.id, input.choreographyId));
}

export function getChoreographyDeletionAvailability(_input: {
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
}): ChoreographyDeletionAvailability {
  return {
    canDelete: false,
    warningMessage: null,
  };
}

async function hydrateChoreographyRows(
  rows: ChoreographyRow[],
): Promise<ChoreographyListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const choreographyIds = rows.map((row) => row.id);
  const [choreographiesWithProfessors] = await Promise.all([
    db
      .select({
        choreographyId: choreographyProfessors.choreographyId,
      })
      .from(choreographyProfessors)
      .where(inArray(choreographyProfessors.choreographyId, choreographyIds)),
  ]);
  const choreographyIdsWithProfessors = new Set(
    choreographiesWithProfessors.map((row) => row.choreographyId),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    modalityName: row.modalityName,
    submodalityName: row.submodalityName,
    groupType: row.groupType,
    categoryName: row.categoryName,
    experienceLevelName: formatExperienceLevelName(row.experienceLevelId),
    musicStorageKey: row.musicStorageKey,
    operationalStatus: deriveChoreographyOperationalStatus({
      categoryId: row.categoryId,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      hasProfessors: choreographyIdsWithProfessors.has(row.id),
      requiresExperienceLevel:
        row.categoryExperienceLevels !== null &&
        row.categoryExperienceLevels.length > 0,
    }),
  }));
}

function formatExperienceLevelName(experienceLevelId: string | null) {
  if (experienceLevelId === null) {
    return null;
  }

  return experienceLevelLabels[experienceLevelId] ?? experienceLevelId;
}
