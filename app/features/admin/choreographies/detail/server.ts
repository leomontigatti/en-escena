import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
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
import { deriveChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { createDefaultChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

import {
  administrativeChoreographyFieldNames,
  administrativeChoreographyNotFoundMessage,
  deleteAdministrativeChoreographyIntent,
  renameAdministrativeChoreographyIntent,
  type AdministrativeChoreographyActionData,
  type AdministrativeChoreographyDeleteBlocker,
} from "./shared";

type AdministrativeChoreographyDetailRow = {
  academyName: string;
  categoryExperienceLevels: string[] | null;
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
  hasPresentation: boolean;
  id: string;
  modalityName: string;
  musicStorageKey: string | null;
  name: string;
  scheduleCapacityId: string | null;
  scheduleDate: string;
  scheduleId: string;
  scheduleName: string;
  scheduleTime: string;
  submodalityName: string | null;
};

export type AdministrativeChoreographyDetailLoaderData = {
  backToList: string;
  canEdit: boolean;
  choreography: AdministrativeChoreographyDetail;
  deletion: {
    blockers: AdministrativeChoreographyDeleteBlocker[];
    canDelete: boolean;
  };
  selectedEventId: string | null;
};

export type AdministrativeChoreographyDetail = {
  academyName: string;
  categoryName: string | null;
  dancers: Array<{
    active: boolean;
    ageAtEventStart: number;
    firstName: string;
    id: string;
    lastName: string;
  }>;
  experienceLevelName: string | null;
  groupType: ChoreographyGroupType;
  hasPresentation: boolean;
  id: string;
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

  const blockers =
    await getAdministrativeChoreographyDeleteBlockers(choreography);

  return {
    backToList: "/administracion/coreografias",
    canEdit: user.role === "admin",
    choreography,
    deletion: {
      blockers,
      canDelete: blockers.length === 0,
    },
    selectedEventId,
  };
}

export async function handleAdministrativeChoreographyDetailAction(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<AdministrativeChoreographyActionData | Response> {
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
      requestUrl: input.request.url,
    });
  }

  if (intent === deleteAdministrativeChoreographyIntent) {
    await deleteAdministrativeChoreography(choreography);
    return redirect(
      "/administracion/coreografias?notificacion=coreografia-eliminada",
    );
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

async function findAdministrativeChoreographyDetail(input: {
  choreographyId: string;
  selectedEventId: string;
}): Promise<AdministrativeChoreographyDetail | null> {
  const rows: AdministrativeChoreographyDetailRow[] = await db
    .select({
      academyName: academies.name,
      categoryExperienceLevels: categories.experienceLevels,
      categoryId: choreographies.categoryId,
      categoryName: categories.name,
      experienceLevelId: choreographies.experienceLevelId,
      groupType: choreographies.groupType,
      hasPresentation: choreographies.hasPresentation,
      id: choreographies.id,
      modalityName: modalities.name,
      musicStorageKey: choreographies.musicStorageKey,
      name: choreographies.name,
      scheduleCapacityId: scheduleCapacities.id,
      scheduleDate: schedules.scheduledDate,
      scheduleId: schedules.id,
      scheduleName: schedules.name,
      scheduleTime: schedules.startTime,
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
    academyName: row.academyName,
    categoryName: row.categoryName,
    dancers: dancerRows,
    experienceLevelName: formatExperienceLevelName(row.experienceLevelId),
    groupType: row.groupType,
    hasPresentation: row.hasPresentation,
    id: row.id,
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
    submodalityName: row.submodalityName,
  };
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
  requestUrl: string;
}) {
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

  return redirect(
    buildDetailNotificationHref(
      input.requestUrl,
      input.choreographyId,
      "coreografia-guardada",
    ),
  );
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
  const [hasInvoices, hasScores] = await Promise.all([
    hasAnyInvoiceForChoreography(choreography.id),
    hasScoresForChoreography(choreography.id),
  ]);
  const blockers: AdministrativeChoreographyDeleteBlocker[] = [];

  if (hasInvoices) {
    blockers.push({ code: "invoices", label: "facturas" });
  }

  if (choreography.hasPresentation) {
    blockers.push({ code: "presentation", label: "presentación" });
  }

  if (hasScores) {
    blockers.push({ code: "scores", label: "puntajes" });
  }

  return blockers;
}

async function hasAnyInvoiceForChoreography(choreographyId: string) {
  const rows = await db
    .select({ id: academyEventChoreographyInvoices.id })
    .from(academyEventChoreographyInvoices)
    .where(eq(academyEventChoreographyInvoices.choreographyId, choreographyId))
    .limit(1);

  return rows.length > 0;
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

function buildDetailNotificationHref(
  requestUrl: string,
  choreographyId: string,
  notification: string,
) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("notificacion");
  searchParams.set("notificacion", notification);

  return `/administracion/coreografias/${choreographyId}?${searchParams.toString()}`;
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
