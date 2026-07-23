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
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { choreographyHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { updateAdministrativeChoreographyRoster } from "@/lib/choreographies/choreography-roster-admin.server";
import { validateSubmodalitySelection } from "@/lib/choreographies/registration-resolution.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import { resolveChoreographyDancers } from "@/lib/choreographies/choreography-roster.server";
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
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { createDefaultChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

import {
  administrativeChoreographyFieldNames,
  administrativeChoreographyNotFoundMessage,
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
  resolveAdministrativeChoreographyRosterIntent,
  updateAdministrativeChoreographyRosterIntent,
  updateAdministrativeChoreographySubmodalityIntent,
  type AdministrativeChoreographyActionData,
  type AdministrativeChoreographyDeleteBlocker,
  type AdministrativeChoreographyRosterErrorData,
  type AdministrativeChoreographySubmodalityErrorData,
  type AdministrativeChoreographySuccessData,
} from "./shared";

type AdministrativeChoreographyDetailRow = {
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

export type AdministrativeChoreographyDetailLoaderData = {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  backToList: string;
  canEdit: boolean;
  choreography: AdministrativeChoreographyDetail;
  deletion: {
    blockers: AdministrativeChoreographyDeleteBlocker[];
    canDelete: boolean;
  };
  selectedEventId: string | null;
  submodalityOptions: Array<{ id: string; name: string }>;
};

export type AdministrativeChoreographyDetail = {
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
  scheduleLabel: string;
  submodalityId: string | null;
  submodalityName: string | null;
};

const renameChoreographySchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

const unsupportedActionMessage = "Acción no soportada.";

export async function loadAdministrativeChoreographyDetailRouteData(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<AdministrativeChoreographyDetailLoaderData> {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const choreographyId = readChoreographyId(input.params);
  const selectedEventId = eventContext.selectedEventId;
  const choreography = selectedEventId
    ? await findAdministrativeChoreographyDetail({
        choreographyId,
        selectedEventId,
      })
    : null;

  if (!choreography) {
    throw new Response(administrativeChoreographyNotFoundMessage, {
      status: 404,
    });
  }

  const [blockers, availableDancers, availableProfessors, submodalityOptions] =
    await Promise.all([
      getAdministrativeChoreographyDeleteBlockers(choreography),
      listDancerOptionsForChoreography(
        choreography.academyId,
        choreography.dancers.map((dancer) => dancer.id),
      ),
      listProfessorOptionsForChoreography(
        choreography.academyId,
        choreography.professors.map((professor) => professor.id),
      ),
      listSubmodalitiesForModality(choreography.modalityId),
    ]);

  return {
    availableDancers,
    availableProfessors,
    backToList: "/administracion/coreografias",
    canEdit: user.role === "admin",
    choreography,
    deletion: {
      blockers,
      canDelete: blockers.length === 0,
    },
    selectedEventId,
    submodalityOptions,
  };
}

export type AdministrativeChoreographyRosterResolutionData = {
  intent: typeof resolveAdministrativeChoreographyRosterIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

export type AdministrativeChoreographyDetailActionData =
  | AdministrativeChoreographyActionData
  | AdministrativeChoreographyRosterErrorData
  | AdministrativeChoreographyRosterResolutionData
  | AdministrativeChoreographySubmodalityErrorData
  | AdministrativeChoreographySuccessData;

export async function handleAdministrativeChoreographyDetailAction(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<AdministrativeChoreographyDetailActionData | Response> {
  await requireAdminUser(input.request);
  const eventContext = await loadAdminEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const choreographyId = readChoreographyId(input.params);

  if (!selectedEventId) {
    throw new Response(administrativeChoreographyNotFoundMessage, {
      status: 404,
    });
  }

  const choreography = await findAdministrativeChoreographyDetail({
    choreographyId,
    selectedEventId,
  });

  if (!choreography) {
    throw new Response(administrativeChoreographyNotFoundMessage, {
      status: 404,
    });
  }

  const formData = await input.request.formData();
  const intent = formData.get("intent");

  if (intent === renameAdministrativeChoreographyIntent) {
    return await renameAdministrativeChoreography({
      choreographyId,
      formData,
    });
  }

  if (intent === deleteAdministrativeChoreographyIntent) {
    await deleteAdministrativeChoreography(choreography);
    return redirectWithFlashNotification(
      "/administracion/coreografias",
      "coreografia-eliminada",
    );
  }

  if (intent === resolveAdministrativeChoreographyRosterIntent) {
    return {
      intent: resolveAdministrativeChoreographyRosterIntent,
      result: await resolveChoreographyDancers({
        academyId: choreography.academyId,
        choreographyId,
        dancerIds: readFormStringArray(formData, "dancerIds"),
        eventId: selectedEventId,
      }),
    };
  }

  if (intent === updateAdministrativeChoreographyRosterIntent) {
    return await updateAdministrativeChoreographyRosterAction({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === updateAdministrativeChoreographySubmodalityIntent) {
    return await updateAdministrativeChoreographySubmodality({
      choreography,
      formData,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

async function findAdministrativeChoreographyDetail(input: {
  choreographyId: string;
  selectedEventId: string;
}): Promise<AdministrativeChoreographyDetail | null> {
  const rows: AdministrativeChoreographyDetailRow[] = await db
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
    listAdministrativeChoreographyDancers(input.choreographyId),
    listAdministrativeChoreographyProfessors(input.choreographyId),
    loadAdministrativeChoreographyMusicDownloadUrl(row.musicStorageKey),
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

async function listAdministrativeChoreographyDancers(choreographyId: string) {
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

async function listAdministrativeChoreographyProfessors(
  choreographyId: string,
) {
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

async function renameAdministrativeChoreography(input: {
  choreographyId: string;
  formData: FormData;
}): Promise<
  AdministrativeChoreographyActionData | AdministrativeChoreographySuccessData
> {
  const values = {
    name: readFormString(input.formData, "name"),
  };
  const parsed = renameChoreographySchema.safeParse(values);

  if (!parsed.success) {
    return {
      fieldErrors: getFieldErrors(
        parsed.error,
        administrativeChoreographyFieldNames,
      ),
      message: "Revisá los campos marcados.",
      status: "error",
      values,
    } satisfies AdministrativeChoreographyActionData;
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

async function updateAdministrativeChoreographySubmodality(input: {
  choreography: AdministrativeChoreographyDetail;
  formData: FormData;
}): Promise<
  | AdministrativeChoreographySubmodalityErrorData
  | AdministrativeChoreographySuccessData
> {
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

async function updateAdministrativeChoreographyRosterAction(input: {
  choreography: AdministrativeChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<
  | AdministrativeChoreographyActionData
  | AdministrativeChoreographyRosterErrorData
  | AdministrativeChoreographySuccessData
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
        fieldErrors: getFieldErrors(
          parsedName.error,
          administrativeChoreographyFieldNames,
        ),
        message: "Revisá los campos marcados.",
        status: "error",
        values: { name: readFormString(input.formData, "name") },
      } satisfies AdministrativeChoreographyActionData;
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

async function deleteAdministrativeChoreography(
  choreography: AdministrativeChoreographyDetail,
) {
  const blockers =
    await getAdministrativeChoreographyDeleteBlockers(choreography);

  if (blockers.length > 0) {
    throw new Response("No se puede eliminar esta coreografía.", {
      status: 409,
    });
  }

  await db.delete(choreographies).where(eq(choreographies.id, choreography.id));
}

async function getAdministrativeChoreographyDeleteBlockers(
  choreography: Pick<
    AdministrativeChoreographyDetail,
    "hasPresentation" | "id"
  >,
): Promise<AdministrativeChoreographyDeleteBlocker[]> {
  const [hasScores, hasComprobantes] = await Promise.all([
    hasScoresForChoreography(choreography.id),
    choreographyHasComprobantes(choreography.id),
  ]);
  const blockers: AdministrativeChoreographyDeleteBlocker[] = [];

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

async function loadAdministrativeChoreographyMusicDownloadUrl(
  storageKey: string | null,
) {
  if (!storageKey) {
    return null;
  }

  try {
    return await createDefaultChoreographyMusicStorage().createMusicSignedUrl(
      storageKey,
    );
  } catch {
    return null;
  }
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(administrativeChoreographyNotFoundMessage, {
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

// La edición en el lugar del detalle no redirige: retorna
// `{ status: "success" }`, el loader revalida y la vista dispara el toast
// directo. Ver docs/agents/form-feedback.md.
function choreographySavedSuccess(): AdministrativeChoreographySuccessData {
  return {
    message: notificationToasts["coreografia-guardada"].message,
    status: "success",
  };
}

function formatExperienceLevelName(experienceLevelId: string | null) {
  if (experienceLevelId === null) {
    return null;
  }

  return experienceLevelLabels[experienceLevelId] ?? experienceLevelId;
}

function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}
