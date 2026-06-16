import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

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
  scheduleBlocks,
  scheduleEntries,
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
  dancerEditingEligibility: DancerEditingEligibility;
  scheduleEntryId: string;
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
      fieldErrors?: {
        scheduleEntryId?: string;
      };
      message: string;
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
      selectedScheduleEntryId: null;
    }
  | {
      status: "keep-current";
      canSave: true;
      options: [ChoreographyDancerScheduleOption];
      selectedScheduleEntryId: string;
    }
  | {
      status: "auto";
      canSave: true;
      options: [ChoreographyDancerScheduleOption];
      selectedScheduleEntryId: string;
    }
  | {
      status: "multiple";
      canSave: true;
      options: ChoreographyDancerScheduleOption[];
      selectedScheduleEntryId: null;
    };

export type ResolveChoreographyDancersResult =
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      resolution: {
        groupType: ChoreographyRegistrationOperationResolution["groupType"];
        schedule: ChoreographyDancerScheduleResolution;
      };
    };

export type ChoreographyDeletionAvailability = {
  canDelete: boolean;
  warningMessage: string | null;
};

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const invalidProfessorSelectionMessage =
  "Seleccioná solo Profesores activos o ya vinculados a esta Coreografía.";
const compatibleDancerRosterRequiredMessage =
  "Esta propuesta cambia datos estructurales de la coreografía. En esta iteración solo podés guardar rosters compatibles.";
const invalidDancerSelectionMessage =
  "Seleccioná solo bailarines activos o ya vinculados a esta coreografía.";
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
  scheduleBlockName: string;
  scheduleDate: string;
  scheduleEntryId: string;
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
      scheduleBlockName: scheduleBlocks.name,
      scheduleDate: scheduleBlocks.scheduledDate,
      scheduleTime: scheduleBlocks.startTime,
      scheduleEntryId: scheduleEntries.id,
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
    dancerEditingEligibility: getDancerEditingEligibility({
      hasActiveFinancialLink: row.hasActiveFinancialLink,
      hasPresentation: row.hasPresentation,
      isRegistrationOpen: options.isRegistrationOpen,
    }),
    scheduleEntryId: row.scheduleEntryId,
    scheduleBlockName: row.scheduleBlockName,
    scheduleLabel: `${row.scheduleDate} · ${row.scheduleTime}`,
    dancers: dancerRows,
    professors: professorRows,
  };
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
    .orderBy(asc(professors.lastName), asc(professors.firstName));

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
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

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

export async function updateChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  isRegistrationOpen: boolean;
  scheduleEntryId?: string | null;
}): Promise<UpdateChoreographyDancersResult> {
  const resolution = await resolveChoreographyDancerUpdateState({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: input.dancerIds,
    eventId: input.eventId,
    isRegistrationOpen: input.isRegistrationOpen,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      message: resolution.message,
    };
  }

  const choreography = resolution.choreography;
  const scheduleEntryId = resolveSelectedScheduleEntryIdForDancerUpdate({
    schedule: resolution.resolution.schedule,
    scheduleEntryId: input.scheduleEntryId ?? null,
  });

  if (!scheduleEntryId.ok) {
    return {
      ok: false,
      fieldErrors: scheduleEntryId.fieldErrors,
      message: scheduleEntryId.message,
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [lockedScheduleEntry] = await tx
        .select({
          id: scheduleEntries.id,
          capacity: scheduleEntries.capacity,
        })
        .from(scheduleEntries)
        .where(eq(scheduleEntries.id, scheduleEntryId.value))
        .for("update");

      if (!lockedScheduleEntry) {
        throw new Error("Expected selected schedule entry to exist.");
      }

      const [occupancyRow] = await tx
        .select({
          occupiedCount: sql<number>`count(*)`,
        })
        .from(choreographies)
        .where(
          and(
            eq(choreographies.scheduleEntryId, lockedScheduleEntry.id),
            ne(choreographies.id, input.choreographyId),
          ),
        );

      const occupiedCount = Number(occupancyRow?.occupiedCount ?? 0);

      if (occupiedCount >= lockedScheduleEntry.capacity) {
        throw new Error("schedule-entry-full");
      }

      await tx
        .update(choreographies)
        .set({
          groupType: resolution.registrationResolution.groupType,
          categoryId:
            resolution.registrationResolution.category.status === "resolved"
              ? resolution.registrationResolution.category.id
              : null,
          categoryCalculationMode:
            resolution.registrationResolution.categoryCalculationMode,
          categoryAgeBasis: resolution.registrationResolution.categoryAgeBasis,
          experienceLevelId: choreography.experienceLevelId,
          scheduleEntryId: lockedScheduleEntry.id,
        })
        .where(eq(choreographies.id, input.choreographyId));

      await tx
        .delete(choreographyDancers)
        .where(eq(choreographyDancers.choreographyId, input.choreographyId));

      await tx.insert(choreographyDancers).values(
        resolution.resolvedDancers.map((dancer) => ({
          choreographyId: input.choreographyId,
          dancerId: dancer.id,
          ageAtEventStart: dancer.ageAtEventStart,
        })),
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "schedule-entry-full") {
      return {
        ok: false,
        message: "El Cronograma seleccionado ya no tiene cupo disponible.",
      };
    }

    throw error;
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
  const resolution = await resolveChoreographyDancerUpdateState(input);

  if (!resolution.ok) {
    return resolution;
  }

  return {
    ok: true,
    resolution: {
      groupType: resolution.registrationResolution.groupType,
      schedule: resolution.resolution.schedule,
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

function isCompatibleRosterResolution(
  choreography: {
    categoryId: string | null;
    experienceLevelId: string | null;
    groupType: "solo" | "duo" | "trio" | "grupal";
    scheduleEntryId: string;
  },
  resolution: ChoreographyRegistrationOperationResolution,
) {
  return (
    isCompatibleCategory(choreography.categoryId, resolution) &&
    isCompatibleExperienceLevel(choreography.experienceLevelId, resolution) &&
    isCompatibleScheduleEntry(choreography.scheduleEntryId, resolution) &&
    choreography.groupType === resolution.groupType
  );
}

function isCompatibleCategory(
  currentCategoryId: string | null,
  resolution: ChoreographyRegistrationOperationResolution,
) {
  const resolvedCategoryId =
    resolution.category.status === "resolved" ? resolution.category.id : null;

  return currentCategoryId === resolvedCategoryId;
}

function isCompatibleExperienceLevel(
  currentExperienceLevelId: string | null,
  resolution: ChoreographyRegistrationOperationResolution,
) {
  if (!resolution.experienceLevel.required) {
    return currentExperienceLevelId === null;
  }

  if (!currentExperienceLevelId) {
    return false;
  }

  return resolution.experienceLevel.options.some(
    (option) => option.id === currentExperienceLevelId,
  );
}

function isCompatibleScheduleEntry(
  currentScheduleEntryId: string,
  resolution: ChoreographyRegistrationOperationResolution,
) {
  if (resolution.schedule.status === "none") {
    return false;
  }

  if (resolution.schedule.status === "auto") {
    return resolution.schedule.scheduleEntryId === currentScheduleEntryId;
  }

  return resolution.schedule.options.some(
    (option) => option.id === currentScheduleEntryId,
  );
}

async function resolveChoreographyDancerUpdateState(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  isRegistrationOpen: boolean;
}): Promise<
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      choreography: {
        id: string;
        modalityId: string;
        submodalityId: string | null;
        categoryId: string | null;
        experienceLevelId: string | null;
        scheduleEntryId: string;
      };
      resolvedDancers: ResolvedRegistrationDancer[];
      registrationResolution: ChoreographyRegistrationOperationResolution;
      resolution: {
        schedule: ChoreographyDancerScheduleResolution;
      };
    }
> {
  const choreography = await db.query.choreographies.findFirst({
    columns: {
      id: true,
      modalityId: true,
      submodalityId: true,
      categoryId: true,
      experienceLevelId: true,
      scheduleEntryId: true,
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

  const registrationResolution =
    await resolveChoreographyRegistrationOperationForResolvedDancers({
      eventId: input.eventId,
      modalityId: choreography.modalityId,
      submodalityId: choreography.submodalityId,
      dancers: resolvedDancers,
    });

  if (!registrationResolution.ok) {
    return {
      ok: false,
      message: compatibleDancerRosterRequiredMessage,
    };
  }

  if (
    !isCompatibleCategory(
      choreography.categoryId,
      registrationResolution.resolution,
    ) ||
    !isCompatibleExperienceLevel(
      choreography.experienceLevelId,
      registrationResolution.resolution,
    )
  ) {
    return {
      ok: false,
      message: compatibleDancerRosterRequiredMessage,
    };
  }

  return {
    ok: true,
    choreography,
    registrationResolution: registrationResolution.resolution,
    resolvedDancers,
    resolution: {
      schedule: resolveDancerUpdateScheduleSelection(
        choreography.scheduleEntryId,
        registrationResolution.resolution,
      ),
    },
  };
}

function resolveDancerUpdateScheduleSelection(
  currentScheduleEntryId: string,
  resolution: ChoreographyRegistrationOperationResolution,
): ChoreographyDancerScheduleResolution {
  if (isCompatibleScheduleEntry(currentScheduleEntryId, resolution)) {
    const currentOption =
      resolution.schedule.options.find(
        (option) => option.id === currentScheduleEntryId,
      ) ?? resolution.schedule.options[0];

    if (!currentOption) {
      return {
        status: "none",
        canSave: false,
        error: compatibleDancerRosterRequiredMessage,
        options: [],
        selectedScheduleEntryId: null,
      };
    }

    return {
      status: "keep-current",
      canSave: true,
      options: [currentOption],
      selectedScheduleEntryId: currentOption.id,
    };
  }

  if (resolution.schedule.status === "none") {
    return {
      status: "none",
      canSave: false,
      error: resolution.schedule.error,
      options: [],
      selectedScheduleEntryId: null,
    };
  }

  if (resolution.schedule.status === "auto") {
    return {
      status: "auto",
      canSave: true,
      options: resolution.schedule.options,
      selectedScheduleEntryId: resolution.schedule.scheduleEntryId,
    };
  }

  return {
    status: "multiple",
    canSave: true,
    options: resolution.schedule.options,
    selectedScheduleEntryId: null,
  };
}

function resolveSelectedScheduleEntryIdForDancerUpdate(input: {
  schedule: ChoreographyDancerScheduleResolution;
  scheduleEntryId: string | null;
}):
  | { ok: true; value: string }
  | {
      ok: false;
      fieldErrors: {
        scheduleEntryId: string;
      };
      message: string;
    } {
  if (
    input.schedule.status === "keep-current" ||
    input.schedule.status === "auto"
  ) {
    return {
      ok: true,
      value: input.schedule.selectedScheduleEntryId,
    };
  }

  if (input.schedule.status === "none") {
    return {
      ok: false,
      fieldErrors: {
        scheduleEntryId: input.schedule.error,
      },
      message: input.schedule.error,
    };
  }

  if (
    !input.scheduleEntryId ||
    !input.schedule.options.some(
      (option) => option.id === input.scheduleEntryId,
    )
  ) {
    return {
      ok: false,
      fieldErrors: {
        scheduleEntryId:
          "Elegí un Cronograma compatible para guardar los bailarines.",
      },
      message: "Elegí un Cronograma compatible para guardar los bailarines.",
    };
  }

  return {
    ok: true,
    value: input.scheduleEntryId,
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
