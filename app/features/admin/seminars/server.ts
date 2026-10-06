import { redirect } from "react-router";

import { listExportableSeminarIds } from "@/features/admin/seminars/export/server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import {
  requireAdminPanelReader,
  requireAdminPanelUser,
} from "@/lib/auth/internal-navigation.server";
import { seminarHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { hasCoveredSeminarInscription } from "@/lib/seminars/covered-inscriptions.server";
import { listSeminarInscriptions } from "@/lib/seminars/inscription-rosters.server";
import { getSeminar, listSeminars } from "@/lib/seminars/repository.server";
import {
  createDefaultSeminarPictureStorage,
  loadSeminarInstructorPictureUrl,
} from "@/lib/storage/seminar-pictures.server";

import {
  defaultSeminarFormValues,
  toSeminarFormValues,
  type SeminarCreateLoaderData,
  type SeminarDetailLoaderData,
  type SeminarsListLoaderData,
} from "./shared";

export async function loadSeminarContext(request: Request) {
  await requireAdminPanelUser(request);

  return await loadSeminarEventContext(request);
}

async function loadSeminarEventContext(request: Request) {
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

/**
 * The list is the one seminar screen the auditor reads: without the way into a
 * seminar's detail, which stays the administrator's, and with the export the
 * administrator does not get.
 */
export async function loadSeminarsListData(
  request: Request,
): Promise<SeminarsListLoaderData> {
  const user = await requireAdminPanelReader(request);
  const { selectedEventId } = await loadSeminarEventContext(request);
  const canWrite = canWriteInAdminPanel(user.role);

  return {
    canWrite,
    exportableSeminarIds:
      canWrite || selectedEventId === null
        ? []
        : [...(await listExportableSeminarIds(selectedEventId))],
    selectedEventId,
    seminars: selectedEventId ? await listSeminars(selectedEventId) : [],
  };
}

export async function loadSeminarCreateData(
  request: Request,
): Promise<SeminarCreateLoaderData> {
  const { selectedEventId } = await loadSeminarContext(request);

  return {
    selectedEventId,
    values: defaultSeminarFormValues(),
  };
}

export async function loadSeminarDetailData(
  request: Request,
  seminarId: string,
): Promise<SeminarDetailLoaderData> {
  const { selectedEventId } = await loadSeminarContext(request);
  const seminar = await getSeminar(seminarId);

  // A seminar belongs to one event, so reading it from another event's context
  // is the same miss as reading one that no longer exists.
  if (!seminar || (selectedEventId && seminar.eventId !== selectedEventId)) {
    throw new Response("No encontramos ese seminario.", { status: 404 });
  }

  return {
    hasComprobantes: await seminarHasComprobantes(seminar.id),
    hasCoveredInscription: await hasCoveredSeminarInscription(seminar.id),
    inscriptions: await listSeminarInscriptions(seminar.id),
    instructorPictureUrl: await loadSeminarInstructorPictureUrl({
      instructorPictureStorageKey: seminar.instructorPictureStorageKey,
      storage: createDefaultSeminarPictureStorage(),
    }),
    selectedEventId: selectedEventId ?? seminar.eventId,
    seminar,
    values: toSeminarFormValues(seminar),
  };
}
