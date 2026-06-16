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
import type {
  ChoreographyListItem,
  ChoreographyOperationalPendingItem,
  ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";

export type ChoreographyDetail = ChoreographyListItem & {
  dancerEditingEligibility: DancerEditingEligibility;
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

export type ChoreographyDeletionAvailability = {
  canDelete: boolean;
  warningMessage: string | null;
};

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const invalidProfessorSelectionMessage =
  "Seleccioná solo Profesores activos o ya vinculados a esta Coreografía.";
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
