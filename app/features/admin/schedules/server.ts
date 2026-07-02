import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listModalities } from "@/lib/modalities/repository.server";
import { listSchedules } from "@/lib/schedules/repository.server";

async function loadEventScheduleContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);

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

  return {
    selectedEventId,
    modalities: selectedEventId ? await listModalities(selectedEventId) : [],
  };
}

export async function loadEventScheduleDetailData(request: Request) {
  const eventContext = await loadEventScheduleContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      modalities: [],
      schedules: [],
    };
  }

  const [modalities, schedules] = await Promise.all([
    listModalities(selectedEventId),
    listSchedules(selectedEventId),
  ]);

  return {
    selectedEventId,
    modalities,
    schedules,
  };
}
