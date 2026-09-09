import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
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

  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadSeminarsListData(
  request: Request,
): Promise<SeminarsListLoaderData> {
  const { selectedEventId } = await loadSeminarContext(request);

  return {
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
    instructorPictureUrl: await loadSeminarInstructorPictureUrl({
      instructorPictureStorageKey: seminar.instructorPictureStorageKey,
      storage: createDefaultSeminarPictureStorage(),
    }),
    selectedEventId: selectedEventId ?? seminar.eventId,
    seminar,
    values: toSeminarFormValues(seminar),
  };
}
