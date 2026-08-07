import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
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
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { choreographyHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { updateAdministrativeChoreographyRoster } from "@/lib/choreographies/choreography-roster-admin.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { validateSubmodalitySelection } from "@/lib/choreographies/registration-resolution.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import { resolveChoreographyDancers } from "@/lib/choreographies/choreography-roster.server";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
} from "@/lib/choreographies/choreography-roster.shared";
import { deriveChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import {
  createDefaultChoreographyMusicStorage,
  loadChoreographyMusicDownloadUrl,
} from "@/lib/storage/choreography-music.server";

import {
  resolveChoreographyScheduleCapacityOptions,
  resolveScheduleCapacityBlockers,
  updateChoreographyScheduleCapacity,
  type ChoreographyScheduleCapacityReassignment,
} from "./schedule-capacity.server";
import {
  canReassignScheduleCapacity,
  choreographyFieldNames,
  deleteChoreographyIntent,
  renameChoreographyIntent,
  resolveChoreographyRosterIntent,
  updateChoreographyRosterIntent,
  updateChoreographyScheduleCapacityIntent,
  updateChoreographySubmodalityIntent,
  type ChoreographyActionData,
  choreographySavedSuccess,
  type ChoreographyDeleteBlocker,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyRosterErrorData,
  type ChoreographySuccessData,
} from "./shared";

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

export type ChoreographyDetailLoaderData = {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  backToList: string;
  canEdit: boolean;
  choreography: ChoreographyDetail;
  deletion: {
    blockers: ChoreographyDeleteBlocker[];
    canDelete: boolean;
  };
  scheduleCapacity: ChoreographyScheduleCapacityReassignment;
  selectedEventId: string | null;
  submodalityOptions: Array<{ id: string; name: string }>;
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
    id: string;
    lastName: string;
  }>;
  experienceLevelId: string | null;
  experienceLevelName: string | null;
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
  scheduleCapacityId: string;
  scheduleId: string;
  scheduleLabel: string;
  submodalityId: string | null;
  submodalityName: string | null;
};

const renameChoreographySchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

const unsupportedActionMessage = "Acción no soportada.";

export async function loadChoreographyDetailRouteData(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<ChoreographyDetailLoaderData> {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const choreographyId = readChoreographyId(input.params);
  const selectedEventId = eventContext.selectedEventId;
  const choreography = selectedEventId
    ? await findChoreographyDetail({
        choreographyId,
        selectedEventId,
      })
    : null;

  if (!selectedEventId || !choreography) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const canEdit = user.role === "admin";
  const [
    blockers,
    availableDancers,
    availableProfessors,
    submodalityOptions,
    scheduleCapacityOptions,
    scheduleCapacityBlockers,
  ] = await Promise.all([
    getChoreographyDeleteBlockers(choreography),
    listDancerOptionsForChoreography(
      choreography.academyId,
      choreography.dancers.map((dancer) => dancer.id),
    ),
    listProfessorOptionsForChoreography(
      choreography.academyId,
      choreography.professors.map((professor) => professor.id),
    ),
    listSubmodalitiesForModality(choreography.modalityId),
    resolveChoreographyScheduleCapacityOptions({
      choreography,
      eventId: selectedEventId,
    }),
    resolveScheduleCapacityBlockers(choreography.id),
  ]);

  return {
    availableDancers,
    availableProfessors,
    backToList: "/administracion/coreografias",
    canEdit,
    choreography,
    deletion: {
      blockers,
      canDelete: blockers.length === 0,
    },
    scheduleCapacity: {
      // Los motivos van a la vista aunque el campo ya esté cerrado por otra
      // causa: la alerta de la página los enumera también para el auditor.
      blockers: scheduleCapacityBlockers,
      // Reasignar es una corrección administrativa: solo `admin`, nunca con
      // presentación, nunca con seña congelada y solo cuando hay más de un cupo
      // compatible entre los que elegir. La coreografía ya presentada tiene el
      // cronograma tan cerrado como el roster.
      canReassign: canReassignScheduleCapacity({
        blockers: scheduleCapacityBlockers,
        canEdit,
        hasMultipleCompatibleOptions:
          scheduleCapacityOptions.hasMultipleCompatibleOptions,
        hasPresentation: choreography.hasPresentation,
      }),
      options: scheduleCapacityOptions.options.map((option) => ({
        id: option.id,
        isFull: option.isFull,
        label: option.label,
      })),
    },
    selectedEventId,
    submodalityOptions,
  };
}

export type ChoreographyRosterResolutionData = {
  intent: typeof resolveChoreographyRosterIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

export type ChoreographyDetailActionData =
  | ChoreographyActionData
  | ChoreographyRosterErrorData
  | ChoreographyRosterResolutionData
  | ChoreographyFieldUpdateErrorData
  | ChoreographySuccessData;

export async function handleChoreographyDetailAction(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<ChoreographyDetailActionData | Response> {
  await requireAdminUser(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const choreographyId = readChoreographyId(input.params);

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const choreography = await findChoreographyDetail({
    choreographyId,
    selectedEventId,
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const formData = await input.request.formData();
  const intent = formData.get("intent");

  if (intent === renameChoreographyIntent) {
    return await renameChoreography({
      choreographyId,
      formData,
    });
  }

  if (intent === deleteChoreographyIntent) {
    await deleteChoreography(choreography);
    return redirectWithFlashNotification(
      "/administracion/coreografias",
      "coreografia-eliminada",
    );
  }

  if (intent === resolveChoreographyRosterIntent) {
    return {
      intent: resolveChoreographyRosterIntent,
      result: await resolveChoreographyDancers({
        academyId: choreography.academyId,
        choreographyId,
        dancerIds: readFormStringArray(formData, "dancerIds"),
        eventId: selectedEventId,
      }),
    };
  }

  if (intent === updateChoreographyRosterIntent) {
    return await updateChoreographyRosterAction({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === updateChoreographySubmodalityIntent) {
    return await updateChoreographySubmodality({
      choreography,
      formData,
    });
  }

  if (intent === updateChoreographyScheduleCapacityIntent) {
    return await updateChoreographyScheduleCapacity({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

async function findChoreographyDetail(input: {
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

  return {
    academyId: row.academyId,
    academyName: row.academyName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    dancers: dancerRows,
    experienceLevelId: row.experienceLevelId,
    experienceLevelName: formatExperienceLevelName(row.experienceLevelId),
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
      requiresExperienceLevel:
        row.categoryExperienceLevels !== null &&
        row.categoryExperienceLevels.length > 0,
    }),
    professors: professorRows,
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

async function listSubmodalitiesForModality(modalityId: string) {
  return await db
    .select({
      id: submodalities.id,
      name: submodalities.name,
    })
    .from(submodalities)
    .where(eq(submodalities.modalityId, modalityId))
    .orderBy(asc(submodalities.name));
}

async function listChoreographyDancers(choreographyId: string) {
  return await db
    .select({
      active: dancers.active,
      ageAtEventStart: choreographyDancers.ageAtEventStart,
      firstName: dancers.firstName,
      id: dancers.id,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(eq(choreographyDancers.choreographyId, choreographyId))
    .orderBy(asc(dancers.firstName), asc(dancers.lastName));
}

async function listChoreographyProfessors(choreographyId: string) {
  return await db
    .select({
      active: professors.active,
      firstName: professors.firstName,
      id: professors.id,
      lastName: professors.lastName,
    })
    .from(choreographyProfessors)
    .innerJoin(
      professors,
      eq(choreographyProfessors.professorId, professors.id),
    )
    .where(eq(choreographyProfessors.choreographyId, choreographyId))
    .orderBy(asc(professors.firstName), asc(professors.lastName));
}

async function renameChoreography(input: {
  choreographyId: string;
  formData: FormData;
}): Promise<ChoreographyActionData | ChoreographySuccessData> {
  const values = {
    name: readFormString(input.formData, "name"),
  };
  const parsed = renameChoreographySchema.safeParse(values);

  if (!parsed.success) {
    return {
      fieldErrors: getFieldErrors(parsed.error, choreographyFieldNames),
      message: "Revisá los campos marcados.",
      status: "error",
      values,
    } satisfies ChoreographyActionData;
  }

  await db
    .update(choreographies)
    .set({
      name: parsed.data.name,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreographyId));

  return choreographySavedSuccess();
}

async function updateChoreographySubmodality(input: {
  choreography: ChoreographyDetail;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Una coreografía con presentación mantiene la submodalidad en solo lectura,
  // igual que el roster: el intent la rechaza aunque el form la mande.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar la submodalidad: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  const availableSubmodalities = await listSubmodalitiesForModality(
    input.choreography.modalityId,
  );
  const submodalityId = readOptionalFormString(input.formData, "submodalityId");
  const validation = validateSubmodalitySelection({
    availableSubmodalities,
    submodalityId,
  });

  if (!validation.ok) {
    return {
      message: validation.failure.error,
      status: "error",
    };
  }

  await db
    .update(choreographies)
    .set({
      submodalityId,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreography.id));

  return choreographySavedSuccess();
}

async function updateChoreographyRosterAction(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<
  ChoreographyActionData | ChoreographyRosterErrorData | ChoreographySuccessData
> {
  // `name` es opcional: un submit que solo toca el roster no lo manda y deja el
  // nombre intacto. Cuando viene, se valida igual que en `rename-choreography`.
  let name: string | undefined;

  if (input.formData.has("name")) {
    const parsedName = renameChoreographySchema.safeParse({
      name: readFormString(input.formData, "name"),
    });

    if (!parsedName.success) {
      return {
        fieldErrors: getFieldErrors(parsedName.error, choreographyFieldNames),
        message: "Revisá los campos marcados.",
        status: "error",
        values: { name: readFormString(input.formData, "name") },
      } satisfies ChoreographyActionData;
    }

    name = parsedName.data.name;
  }

  const result = await updateAdministrativeChoreographyRoster({
    academyId: input.choreography.academyId,
    choreographyId: input.choreography.id,
    dancerIds: readFormStringArray(input.formData, "dancerIds"),
    eventId: input.eventId,
    experienceLevelId: readOptionalFormString(
      input.formData,
      "experienceLevelId",
    ),
    name,
    professorIds: readFormStringArray(input.formData, "professorIds"),
    scheduleCapacityId: readOptionalFormString(
      input.formData,
      "scheduleCapacityId",
    ),
  });

  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      section: result.section,
      status: "roster-error",
    };
  }

  return choreographySavedSuccess();
}

async function deleteChoreography(choreography: ChoreographyDetail) {
  const blockers = await getChoreographyDeleteBlockers(choreography);

  if (blockers.length > 0) {
    throw new Response("No se puede eliminar esta coreografía.", {
      status: 409,
    });
  }

  await db.delete(choreographies).where(eq(choreographies.id, choreography.id));
}

async function getChoreographyDeleteBlockers(
  choreography: Pick<ChoreographyDetail, "hasPresentation" | "id">,
): Promise<ChoreographyDeleteBlocker[]> {
  const [hasScores, hasComprobantes] = await Promise.all([
    hasScoresForChoreography(choreography.id),
    choreographyHasComprobantes(choreography.id),
  ]);
  const blockers: ChoreographyDeleteBlocker[] = [];

  if (choreography.hasPresentation) {
    blockers.push({ code: "presentation", label: "presentación" });
  }

  if (hasScores) {
    blockers.push({ code: "scores", label: "puntajes" });
  }

  // Historia fiscal: cualquier comprobante ARCA (vigente, anulado o NC) ancla la
  // coreografía de forma irreversible. Guarda server-side de #340, evaluada acá
  // recién antes del borrado por si se emitió entre el render y el click.
  if (hasComprobantes) {
    blockers.push({ code: "comprobantes", label: "comprobantes" });
  }

  return blockers;
}

async function hasScoresForChoreography(_choreographyId: string) {
  return false;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  return params.choreographyId;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatExperienceLevelName(experienceLevelId: string | null) {
  if (experienceLevelId === null) {
    return null;
  }

  return experienceLevelLabels[experienceLevelId] ?? experienceLevelId;
}
