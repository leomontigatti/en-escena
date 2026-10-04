import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listCategories } from "@/lib/categories/repository.server";
import { listModalities } from "@/lib/modalities/repository.server";
import { getEventRegistrationOpenBlockers } from "@/lib/schedules/registration-open.server";
import {
  getScheduleDependencySummary,
  listSchedules,
} from "@/lib/schedules/repository.server";

async function loadEventScheduleContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadEventSchedulesListData(request: Request) {
  const eventContext = await loadEventScheduleContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    schedules: selectedEventId ? await listSchedules(selectedEventId) : [],
  };
}

export async function loadEventScheduleFormOptions(request: Request) {
  const eventContext = await loadEventScheduleContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return { selectedEventId, modalities: [], categories: [] };
  }

  const [modalities, categories] = await Promise.all([
    listModalities(selectedEventId),
    listCategories(selectedEventId),
  ]);

  return { selectedEventId, modalities, categories };
}

export async function loadEventScheduleDetailData(
  request: Request,
  scheduleId: string,
) {
  const eventContext = await loadEventScheduleContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      modalities: [],
      categories: [],
      schedules: [],
      registrationOpenBlockers: [],
      scheduleDependencies: null,
    };
  }

  const [modalities, categories, schedules, registrationOpenBlockers] =
    await Promise.all([
      listModalities(selectedEventId),
      listCategories(selectedEventId),
      listSchedules(selectedEventId),
      getEventRegistrationOpenBlockers(selectedEventId),
    ]);
  // Only a schedule of the selected event: another event's id renders the
  // empty state, and its dependencies are none of this page's business.
  const scheduleDependencies = schedules.some(
    (schedule) => schedule.id === scheduleId,
  )
    ? await getScheduleDependencySummary(scheduleId)
    : null;

  return {
    selectedEventId,
    modalities,
    categories,
    schedules,
    registrationOpenBlockers,
    scheduleDependencies,
  };
}
