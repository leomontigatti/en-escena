import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  categoryExperienceLevels,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  experienceLevels,
  modalities,
  professors,
  schedules,
  scheduleCapacities,
  submodalities,
} from "@/db/schema";
import {
  resolveChoreographyRegistrationOperationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import type {
  ChoreographyListItem,
  ChoreographyOperationalPendingItem,
  ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";

export type ChoreographyDetail = ChoreographyListItem & {
  categoryId: string | null;
  experienceLevelId: string | null;
  dancerEditingEligibility: DancerEditingEligibility;
  hasPresentation?: boolean;
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

export type ChoreographyProfessorOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

export type ChoreographyDancerOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

export type DancerEditingBlockReason =
  | "presentation"
  | "active-financial-link"
  | "registration-closed";

export type DancerEditingEligibility =
  | {
      canEdit: true;
      reasonCode: null;
      reasonText: null;
    }
  | {
      canEdit: false;
      reasonCode: DancerEditingBlockReason;
      reasonText: string;
    };

export type UpdateChoreographyProfessorsResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export type UpdateChoreographyDancersResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      fieldErrors?: {
        experienceLevelId?: string;
        scheduleCapacityId?: string;
      };
    };

export type UpdateChoreographyResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      section: "dancers" | "professors";
      fieldErrors?: {
        experienceLevelId?: string;
        scheduleCapacityId?: string;
      };
    };

export type ChoreographyDancerScheduleOption =
  ChoreographyRegistrationOperationResolution["schedule"] extends {
    options: infer TOptions;
  }
    ? TOptions extends Array<infer TOption>
      ? TOption
      : never
    : never;

export type ChoreographyDancerScheduleResolution =
  | {
      status: "none";
      canSave: false;
      error: string;
      options: [];
      selectedScheduleCapacityId: null;
    }
  | {
      status: "keep-current";
      canSave: true;
      options: [ChoreographyDancerScheduleOption];
      selectedScheduleCapacityId: string;
    }
  | {
      status: "auto";
      canSave: true;
      options: [ChoreographyDancerScheduleOption];
      selectedScheduleCapacityId: string;
    }
  | {
      status: "multiple";
      canSave: true;
      options: ChoreographyDancerScheduleOption[];
      selectedScheduleCapacityId: null;
    };

export type ChoreographyCategoryCalculationMode =
  ChoreographyRegistrationOperationResolution["categoryCalculationMode"];

export type ResolveChoreographyDancersResult =
  | {
      ok: true;
      resolution: {
        groupType: ChoreographyListItem["groupType"];
        categoryId: string | null;
        categoryName: string | null;
        categoryCalculationMode?: ChoreographyCategoryCalculationMode;
        categoryAgeBasis?: ChoreographyRegistrationOperationResolution["categoryAgeBasis"];
        experienceLevel: {
          required: boolean;
          options: Array<{
            id: string;
            name: string;
          }>;
        };
        schedule: ChoreographyDancerScheduleResolution;
      };
    }
  | {
      ok: false;
      message: string;
    };

export type ChoreographyDeletionAvailability = {
  canDelete: boolean;
  warningMessage: string | null;
};

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const invalidProfessorSelectionMessage =
  "Seleccioná solo Profesores activos o ya vinculados a esta Coreografía.";
const invalidDancerSelectionMessage =
  "Seleccioná solo bailarines activos o ya vinculados a esta coreografía.";
const invalidExperienceLevelMessage =
  "Elegí un nivel de experiencia válido para esta coreografía.";
const compatibleScheduleSelectionRequiredMessage =
  "Elegí un Cupo de cronograma compatible para guardar los bailarines.";
const closedRegistrationDeletionWarningMessage =
  "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.";
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

type ChoreographyDetailRow = ChoreographyRow & {
  hasActiveFinancialLink: boolean;
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
      hasActiveFinancialLink: choreographies.hasActiveFinancialLink,
      hasPresentation: choreographies.hasPresentation,
      musicStorageKey: choreographies.musicStorageKey,
      modalityName: modalities.name,
      submodalityName: submodalities.name,
      categoryName: categories.name,
      experienceLevelName: experienceLevels.name,
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
      experienceLevels,
      eq(choreographies.experienceLevelId, experienceLevels.id),
    )
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
      hasActiveFinancialLink: row.hasActiveFinancialLink,
      hasPresentation: row.hasPresentation,
      isRegistrationOpen: options.isRegistrationOpen,
    }),
    experienceLevelId: row.experienceLevelId,
    hasPresentation: row.hasPresentation,
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

function formatScheduleDateTime(input: {
  name: string;
  scheduledDate: string;
  startTime: string;
}) {
  const [year, month, day] = input.scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return input.name;
  }

  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const formattedTime = input.startTime.slice(0, 5);

  return `${formattedDate} - ${formattedTime} hs.`;
}

function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}

export async function listProfessorOptionsForChoreography(
  academyId: string,
  linkedProfessorIds: string[],
): Promise<ChoreographyProfessorOption[]> {
  const linkedProfessorIdsSet = new Set(linkedProfessorIds);
  const rows = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
    })
    .from(professors)
    .where(eq(professors.academyId, academyId))
    .orderBy(asc(professors.firstName), asc(professors.lastName));

  return rows.filter(
    (professor) => professor.active || linkedProfessorIdsSet.has(professor.id),
  );
}

export async function listDancerOptionsForChoreography(
  academyId: string,
  linkedDancerIds: string[],
): Promise<ChoreographyDancerOption[]> {
  const linkedDancerIdsSet = new Set(linkedDancerIds);
  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
    })
    .from(dancers)
    .where(eq(dancers.academyId, academyId))
    .orderBy(asc(dancers.firstName), asc(dancers.lastName));

  return rows.filter(
    (dancer) => dancer.active || linkedDancerIdsSet.has(dancer.id),
  );
}

export async function updateChoreographyProfessors(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  professorIds: string[];
}): Promise<UpdateChoreographyProfessorsResult> {
  const choreography = await db.query.choreographies.findFirst({
    columns: { id: true },
    where: and(
      eq(choreographies.id, input.choreographyId),
      eq(choreographies.academyId, input.academyId),
      eq(choreographies.eventId, input.eventId),
    ),
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const requestedProfessorIds = [...new Set(input.professorIds)];
  const requestedProfessorIdsSet = new Set(requestedProfessorIds);
  const currentLinks = await db
    .select({
      professorId: choreographyProfessors.professorId,
    })
    .from(choreographyProfessors)
    .where(eq(choreographyProfessors.choreographyId, input.choreographyId));
  const linkedProfessorIds = new Set(
    currentLinks.map((row) => row.professorId),
  );

  if (requestedProfessorIds.length > 0) {
    const selectedProfessors = await db.query.professors.findMany({
      columns: { id: true, active: true },
      where: and(
        eq(professors.academyId, input.academyId),
        inArray(professors.id, requestedProfessorIds),
      ),
    });

    const allowedProfessorIds = new Set(
      selectedProfessors
        .filter(
          (professor) =>
            professor.active || linkedProfessorIds.has(professor.id),
        )
        .map((professor) => professor.id),
    );

    if (
      selectedProfessors.length !== requestedProfessorIds.length ||
      requestedProfessorIds.some((id) => !allowedProfessorIds.has(id))
    ) {
      return {
        ok: false,
        message: invalidProfessorSelectionMessage,
      };
    }
  }

  const professorIdsToRemove = currentLinks
    .map((row) => row.professorId)
    .filter((id) => !requestedProfessorIdsSet.has(id));
  const professorIdsToAdd = requestedProfessorIds.filter(
    (id) => !linkedProfessorIds.has(id),
  );

  await db.transaction(async (tx) => {
    if (professorIdsToRemove.length > 0) {
      await tx
        .delete(choreographyProfessors)
        .where(
          and(
            eq(choreographyProfessors.choreographyId, input.choreographyId),
            inArray(choreographyProfessors.professorId, professorIdsToRemove),
          ),
        );
    }

    if (professorIdsToAdd.length > 0) {
      await tx.insert(choreographyProfessors).values(
        professorIdsToAdd.map((professorId) => ({
          choreographyId: input.choreographyId,
          professorId,
        })),
      );
    }
  });

  return { ok: true };
}

async function validateChoreographyProfessorSelection(input: {
  academyId: string;
  choreographyId: string;
  professorIds: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const requestedProfessorIds = [...new Set(input.professorIds)];

  if (requestedProfessorIds.length === 0) {
    return { ok: true };
  }

  const currentLinks = await db
    .select({
      professorId: choreographyProfessors.professorId,
    })
    .from(choreographyProfessors)
    .where(eq(choreographyProfessors.choreographyId, input.choreographyId));
  const linkedProfessorIds = new Set(
    currentLinks.map((row) => row.professorId),
  );
  const selectedProfessors = await db.query.professors.findMany({
    columns: { id: true, active: true },
    where: and(
      eq(professors.academyId, input.academyId),
      inArray(professors.id, requestedProfessorIds),
    ),
  });
  const allowedProfessorIds = new Set(
    selectedProfessors
      .filter(
        (professor) => professor.active || linkedProfessorIds.has(professor.id),
      )
      .map((professor) => professor.id),
  );

  if (
    selectedProfessors.length !== requestedProfessorIds.length ||
    requestedProfessorIds.some((id) => !allowedProfessorIds.has(id))
  ) {
    return {
      ok: false,
      message: invalidProfessorSelectionMessage,
    };
  }

  return { ok: true };
}

export async function updateChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  experienceLevelId: string | null;
  scheduleCapacityId?: string | null;
  isRegistrationOpen: boolean;
}): Promise<UpdateChoreographyDancersResult> {
  const resolvedUpdate = await resolveChoreographyDancerUpdateContext(input);

  if (!resolvedUpdate.ok) {
    return resolvedUpdate;
  }

  const { choreography, resolvedDancers, resolution, scheduleResolution } =
    resolvedUpdate;

  const resolvedExperienceLevelId = resolveSelectedExperienceLevelId({
    currentCategoryId: choreography.categoryId,
    currentExperienceLevelId: choreography.experienceLevelId,
    experienceLevelId: input.experienceLevelId,
    resolution,
  });

  if (!resolvedExperienceLevelId.ok) {
    return {
      ok: false,
      message: resolvedExperienceLevelId.message,
      fieldErrors: resolvedExperienceLevelId.fieldErrors,
    };
  }

  const resolvedScheduleCapacityId =
    resolveSelectedScheduleCapacityIdForDancerUpdate({
      schedule: scheduleResolution,
      scheduleCapacityId: input.scheduleCapacityId ?? null,
    });

  if (!resolvedScheduleCapacityId.ok) {
    return {
      ok: false,
      message: resolvedScheduleCapacityId.message,
      fieldErrors: resolvedScheduleCapacityId.fieldErrors,
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [lockedSchedule] = await tx
        .select({
          id: schedules.id,
          totalCapacity: schedules.totalCapacity,
        })
        .from(schedules)
        .where(eq(schedules.id, resolvedScheduleCapacityId.value.scheduleId))
        .for("update");

      if (!lockedSchedule) {
        throw new Error("Expected selected schedule to exist.");
      }

      if (resolvedScheduleCapacityId.value.scheduleCapacityId) {
        const [lockedScheduleCapacity] = await tx
          .select({
            id: scheduleCapacities.id,
            capacity: scheduleCapacities.capacity,
          })
          .from(scheduleCapacities)
          .where(
            eq(
              scheduleCapacities.id,
              resolvedScheduleCapacityId.value.scheduleCapacityId,
            ),
          )
          .for("update");

        if (!lockedScheduleCapacity) {
          throw new Error("Expected selected schedule entry to exist.");
        }

        const [specificOccupancyRow] = await tx
          .select({
            occupiedCount: sql<number>`count(*)`,
          })
          .from(choreographies)
          .where(
            and(
              eq(choreographies.scheduleCapacityId, lockedScheduleCapacity.id),
              ne(choreographies.id, input.choreographyId),
            ),
          );

        const specificOccupiedCount = Number(
          specificOccupancyRow?.occupiedCount ?? 0,
        );

        if (specificOccupiedCount >= lockedScheduleCapacity.capacity) {
          throw new Error("schedule-capacity-full");
        }
      }

      const [scheduleOccupancyRow] = await tx
        .select({
          occupiedCount: sql<number>`count(*)`,
        })
        .from(choreographies)
        .leftJoin(
          scheduleCapacities,
          eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
        )
        .where(
          and(
            ne(choreographies.id, input.choreographyId),
            or(
              eq(choreographies.scheduleId, lockedSchedule.id),
              eq(scheduleCapacities.scheduleId, lockedSchedule.id),
            ),
          ),
        );

      const scheduleOccupiedCount = Number(
        scheduleOccupancyRow?.occupiedCount ?? 0,
      );

      if (scheduleOccupiedCount >= lockedSchedule.totalCapacity) {
        throw new Error("schedule-capacity-full");
      }

      await tx
        .delete(choreographyDancers)
        .where(eq(choreographyDancers.choreographyId, input.choreographyId));

      await tx.insert(choreographyDancers).values(
        resolvedDancers.map((dancer) => ({
          choreographyId: input.choreographyId,
          dancerId: dancer.id,
          ageAtEventStart: dancer.ageAtEventStart,
        })),
      );

      await tx
        .update(choreographies)
        .set({
          groupType: resolution.groupType,
          categoryId:
            resolution.category.status === "resolved"
              ? resolution.category.id
              : null,
          categoryCalculationMode: resolution.categoryCalculationMode,
          categoryAgeBasis: resolution.categoryAgeBasis,
          experienceLevelId: resolvedExperienceLevelId.value,
          scheduleId: lockedSchedule.id,
          scheduleCapacityId:
            resolvedScheduleCapacityId.value.scheduleCapacityId,
        })
        .where(eq(choreographies.id, input.choreographyId));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "schedule-capacity-full") {
      return {
        ok: false,
        message:
          "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
      };
    }

    throw error;
  }

  return { ok: true };
}

export async function updateChoreography(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string | null;
  scheduleCapacityId?: string | null;
  isRegistrationOpen: boolean;
}): Promise<UpdateChoreographyResult> {
  const [currentDancerLinks, currentProfessorLinks] = await Promise.all([
    db
      .select({ dancerId: choreographyDancers.dancerId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, input.choreographyId)),
    db
      .select({ professorId: choreographyProfessors.professorId })
      .from(choreographyProfessors)
      .where(eq(choreographyProfessors.choreographyId, input.choreographyId)),
  ]);
  const dancerIdsChanged = !haveSameIds(
    currentDancerLinks.map((row) => row.dancerId),
    input.dancerIds,
  );
  const professorIdsChanged = !haveSameIds(
    currentProfessorLinks.map((row) => row.professorId),
    input.professorIds,
  );

  if (!dancerIdsChanged && !professorIdsChanged) {
    return { ok: true };
  }

  if (professorIdsChanged) {
    const professorValidation = await validateChoreographyProfessorSelection({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      professorIds: input.professorIds,
    });

    if (!professorValidation.ok) {
      return {
        ok: false,
        section: "professors",
        message: professorValidation.message,
      };
    }
  }

  if (dancerIdsChanged) {
    const dancerResult = await updateChoreographyDancers({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      dancerIds: input.dancerIds,
      eventId: input.eventId,
      experienceLevelId: input.experienceLevelId,
      isRegistrationOpen: input.isRegistrationOpen,
      scheduleCapacityId: input.scheduleCapacityId,
    });

    if (!dancerResult.ok) {
      return {
        ok: false,
        section: "dancers",
        message: dancerResult.message,
        fieldErrors: dancerResult.fieldErrors,
      };
    }
  }

  if (professorIdsChanged) {
    const professorResult = await updateChoreographyProfessors({
      academyId: input.academyId,
      eventId: input.eventId,
      choreographyId: input.choreographyId,
      professorIds: input.professorIds,
    });

    if (!professorResult.ok) {
      return {
        ok: false,
        section: "professors",
        message: professorResult.message,
      };
    }
  }

  return { ok: true };
}

export async function resolveChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  isRegistrationOpen: boolean;
}): Promise<ResolveChoreographyDancersResult> {
  const resolvedUpdate = await resolveChoreographyDancerUpdateContext(input);

  if (!resolvedUpdate.ok) {
    return resolvedUpdate;
  }

  const { resolution, scheduleResolution } = resolvedUpdate;

  return {
    ok: true,
    resolution: {
      groupType: resolution.groupType,
      categoryId:
        resolution.category.status === "resolved"
          ? resolution.category.id
          : null,
      categoryName:
        resolution.category.status === "resolved"
          ? resolution.category.name
          : null,
      categoryCalculationMode: resolution.categoryCalculationMode,
      categoryAgeBasis: resolution.categoryAgeBasis,
      experienceLevel: resolution.experienceLevel,
      schedule: scheduleResolution,
    },
  };
}

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

  await db
    .delete(choreographies)
    .where(eq(choreographies.id, input.choreographyId));
}

export function getChoreographyDeletionAvailability(input: {
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
}): ChoreographyDeletionAvailability {
  if (input.isReadOnly) {
    return {
      canDelete: false,
      warningMessage: null,
    };
  }

  return {
    canDelete: true,
    warningMessage: input.isRegistrationOpen
      ? null
      : closedRegistrationDeletionWarningMessage,
  };
}

export function getDancerEditingEligibility(input: {
  hasActiveFinancialLink: boolean;
  hasPresentation: boolean;
  isRegistrationOpen: boolean;
}): DancerEditingEligibility {
  if (input.hasPresentation) {
    return {
      canEdit: false,
      reasonCode: "presentation",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    };
  }

  if (input.hasActiveFinancialLink) {
    return {
      canEdit: false,
      reasonCode: "active-financial-link",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque tiene un vínculo financiero activo.",
    };
  }

  if (!input.isRegistrationOpen) {
    return {
      canEdit: false,
      reasonCode: "registration-closed",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque el período de inscripción está cerrado.",
    };
  }

  return {
    canEdit: true,
    reasonCode: null,
    reasonText: null,
  };
}

function resolveSelectedExperienceLevelId(input: {
  currentCategoryId: string | null;
  currentExperienceLevelId: string | null;
  experienceLevelId: string | null;
  resolution: ChoreographyRegistrationOperationResolution;
}):
  | { ok: true; value: string | null }
  | {
      ok: false;
      message: string;
      fieldErrors: {
        experienceLevelId: string;
      };
    } {
  if (!input.resolution.experienceLevel.required) {
    return { ok: true, value: null };
  }

  const resolvedCategoryId =
    input.resolution.category.status === "resolved"
      ? input.resolution.category.id
      : null;
  const categoryChanged = input.currentCategoryId !== resolvedCategoryId;

  if (
    !categoryChanged &&
    input.currentExperienceLevelId &&
    input.resolution.experienceLevel.options.some(
      (option) => option.id === input.currentExperienceLevelId,
    )
  ) {
    return { ok: true, value: input.currentExperienceLevelId };
  }

  if (!input.experienceLevelId) {
    return {
      ok: false,
      message: invalidExperienceLevelMessage,
      fieldErrors: {
        experienceLevelId: "Este campo es obligatorio.",
      },
    };
  }

  const isValidLevel = input.resolution.experienceLevel.options.some(
    (option) => option.id === input.experienceLevelId,
  );

  if (!isValidLevel) {
    return {
      ok: false,
      message: invalidExperienceLevelMessage,
      fieldErrors: {
        experienceLevelId: invalidExperienceLevelMessage,
      },
    };
  }

  return { ok: true, value: input.experienceLevelId };
}

function haveSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((id) => leftSet.has(id));
}

function isCompatibleScheduleCapacity(
  currentScheduleCapacityId: string,
  resolution: ChoreographyRegistrationOperationResolution,
) {
  if (resolution.schedule.status === "none") {
    return false;
  }

  if (resolution.schedule.status === "auto") {
    return resolution.schedule.scheduleCapacityId === currentScheduleCapacityId;
  }

  return resolution.schedule.options.some(
    (option) => option.id === currentScheduleCapacityId,
  );
}

function resolveDancerUpdateScheduleSelection(
  currentScheduleCapacityId: string,
  resolution: ChoreographyRegistrationOperationResolution,
): ChoreographyDancerScheduleResolution {
  if (isCompatibleScheduleCapacity(currentScheduleCapacityId, resolution)) {
    const currentOption =
      resolution.schedule.status === "auto"
        ? (resolution.schedule.options.find(
            (option) => option.id === currentScheduleCapacityId,
          ) ?? resolution.schedule.options[0])
        : resolution.schedule.options.find(
            (option) => option.id === currentScheduleCapacityId,
          );

    if (!currentOption) {
      return {
        status: "none",
        canSave: false,
        error:
          "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
        options: [],
        selectedScheduleCapacityId: null,
      };
    }

    return {
      status: "keep-current",
      canSave: true,
      options: [currentOption],
      selectedScheduleCapacityId: currentOption.id,
    };
  }

  if (resolution.schedule.status === "none") {
    return {
      status: "none",
      canSave: false,
      error: resolution.schedule.error,
      options: [],
      selectedScheduleCapacityId: null,
    };
  }

  if (resolution.schedule.status === "auto") {
    return {
      status: "auto",
      canSave: true,
      options: resolution.schedule.options,
      selectedScheduleCapacityId: resolution.schedule.scheduleCapacityId,
    };
  }

  return {
    status: "multiple",
    canSave: true,
    options: resolution.schedule.options,
    selectedScheduleCapacityId: null,
  };
}

function resolveSelectedScheduleCapacityIdForDancerUpdate(input: {
  schedule: ChoreographyDancerScheduleResolution;
  scheduleCapacityId: string | null;
}):
  | {
      ok: true;
      value: {
        scheduleId: string;
        scheduleCapacityId: string | null;
      };
    }
  | {
      ok: false;
      message: string;
      fieldErrors: {
        scheduleCapacityId: string;
      };
    } {
  if (
    input.schedule.status === "keep-current" ||
    input.schedule.status === "auto"
  ) {
    const [option] = input.schedule.options;

    return {
      ok: true,
      value: {
        scheduleId: option.scheduleId,
        scheduleCapacityId: option.scheduleCapacityId,
      },
    };
  }

  if (input.schedule.status === "none") {
    return {
      ok: false,
      message: input.schedule.error,
      fieldErrors: {
        scheduleCapacityId: input.schedule.error,
      },
    };
  }

  const selectedOption = input.schedule.options.find(
    (option) => option.id === input.scheduleCapacityId,
  );

  if (!selectedOption) {
    return {
      ok: false,
      message: compatibleScheduleSelectionRequiredMessage,
      fieldErrors: {
        scheduleCapacityId: compatibleScheduleSelectionRequiredMessage,
      },
    };
  }

  return {
    ok: true,
    value: {
      scheduleId: selectedOption.scheduleId,
      scheduleCapacityId: selectedOption.scheduleCapacityId,
    },
  };
}

function getLocalDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
  };
}

type ResolvedChoreographyDancerUpdateContext =
  | {
      ok: true;
      choreography: {
        id: string;
        modalityId: string;
        submodalityId: string | null;
        categoryId: string | null;
        experienceLevelId: string | null;
        scheduleId: string | null;
        scheduleCapacityId: string | null;
        hasActiveFinancialLink: boolean;
        hasPresentation: boolean;
      };
      resolvedDancers: ResolvedRegistrationDancer[];
      resolution: ChoreographyRegistrationOperationResolution;
      scheduleResolution: ChoreographyDancerScheduleResolution;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: {
        experienceLevelId?: string;
      };
    };

async function resolveChoreographyDancerUpdateContext(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  isRegistrationOpen: boolean;
}): Promise<ResolvedChoreographyDancerUpdateContext> {
  const choreography = await db.query.choreographies.findFirst({
    columns: {
      id: true,
      modalityId: true,
      submodalityId: true,
      categoryId: true,
      experienceLevelId: true,
      scheduleId: true,
      scheduleCapacityId: true,
      hasActiveFinancialLink: true,
      hasPresentation: true,
    },
    where: and(
      eq(choreographies.id, input.choreographyId),
      eq(choreographies.academyId, input.academyId),
      eq(choreographies.eventId, input.eventId),
    ),
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eligibility = getDancerEditingEligibility({
    hasActiveFinancialLink: choreography.hasActiveFinancialLink,
    hasPresentation: choreography.hasPresentation,
    isRegistrationOpen: input.isRegistrationOpen,
  });

  if (!eligibility.canEdit) {
    return {
      ok: false,
      message: eligibility.reasonText,
    };
  }

  const requestedDancerIds = [...new Set(input.dancerIds)];
  const currentLinks = await db
    .select({
      dancerId: choreographyDancers.dancerId,
    })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, input.choreographyId));
  const linkedDancerIds = new Set(currentLinks.map((row) => row.dancerId));

  const selectedDancers =
    requestedDancerIds.length > 0
      ? await db.query.dancers.findMany({
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            active: true,
          },
          where: and(
            eq(dancers.academyId, input.academyId),
            inArray(dancers.id, requestedDancerIds),
          ),
        })
      : [];

  const allowedDancerIds = new Set(
    selectedDancers
      .filter((dancer) => dancer.active || linkedDancerIds.has(dancer.id))
      .map((dancer) => dancer.id),
  );

  if (
    selectedDancers.length !== requestedDancerIds.length ||
    requestedDancerIds.some((id) => !allowedDancerIds.has(id))
  ) {
    return {
      ok: false,
      message: invalidDancerSelectionMessage,
    };
  }

  const event = await db.query.events.findFirst({
    columns: { startsAt: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventLocalStartDate = getLocalDateParts(event.startsAt);
  const selectedDancerById = new Map(
    selectedDancers.map((dancer) => [dancer.id, dancer]),
  );
  const resolvedDancers = requestedDancerIds.map((dancerId) => {
    const dancer = selectedDancerById.get(dancerId);

    if (!dancer) {
      throw new Error("Expected selected dancer to exist after validation.");
    }

    return {
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      ageAtEventStart: getAgeAtDate(dancer.birthDate, eventLocalStartDate),
    } satisfies ResolvedRegistrationDancer;
  });

  const resolution =
    await resolveChoreographyRegistrationOperationForResolvedDancers({
      eventId: input.eventId,
      modalityId: choreography.modalityId,
      submodalityId: choreography.submodalityId,
      dancers: resolvedDancers,
    });

  if (!resolution.ok) {
    return {
      ok: false,
      message: resolution.error,
    };
  }

  return {
    ok: true,
    choreography,
    resolvedDancers,
    resolution: resolution.resolution,
    scheduleResolution: resolveDancerUpdateScheduleSelection(
      getCurrentScheduleSelectionId(choreography),
      resolution.resolution,
    ),
  };
}

function getCurrentScheduleSelectionId(input: {
  scheduleId: string | null;
  scheduleCapacityId: string | null;
}) {
  if (input.scheduleCapacityId) {
    return input.scheduleCapacityId;
  }

  if (input.scheduleId) {
    return getGlobalScheduleCapacityOptionId(input.scheduleId);
  }

  return "";
}

function getAgeAtDate(
  birthDate: string,
  date: { year: number; month: number; day: number },
) {
  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map((value) => Number(value));
  const hasHadBirthday =
    date.month > birthMonth ||
    (date.month === birthMonth && date.day >= birthDay);

  return date.year - birthYear - (hasHadBirthday ? 0 : 1);
}

async function hydrateChoreographyRows(
  rows: ChoreographyRow[],
): Promise<ChoreographyListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const choreographyIds = rows.map((row) => row.id);
  const categoryIds = [
    ...new Set(
      rows
        .map((row) => row.categoryId)
        .filter((value): value is string => value !== null),
    ),
  ];
  const [choreographiesWithProfessors, categoryLevelRows] = await Promise.all([
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
    choreographiesWithProfessors.map((row) => row.choreographyId),
  );
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
      hasProfessors: choreographyIdsWithProfessors.has(row.id),
      requiresExperienceLevel:
        row.categoryId !== null && categoryIdsWithLevels.has(row.categoryId),
    }),
  }));
}

function deriveOperationalStatus(input: {
  categoryId: string | null;
  experienceLevelId: string | null;
  hasMusic: boolean;
  hasProfessors: boolean;
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

  if (!input.hasProfessors) {
    pendingItems.push("professors");
  }

  return {
    code: pendingItems.length === 0 ? "complete" : "incomplete",
    pendingItems,
  };
}
